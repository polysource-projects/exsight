import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthedUser } from "@/lib/database";
import { auth } from "@/auth";
import { sections } from "@/lib/epfl";
import { Section, Year } from "@prisma/client";

// Get currently logged in account
export async function GET() {
	let self = await auth();
	let account = await getAuthedUser();
	// if (!account)
	// 	return NextResponse.json({ error: "Not logged in" }, { status: 401 });

	return NextResponse.json({ auth: self, account });
}

// Register account
export async function POST(request: NextRequest) {
	// If not authed, return error
	let them = await auth();
	if (!them)
		return NextResponse.json({ error: "Not logged in" }, { status: 401 });

	// If already registered, return error
	let account = await getAuthedUser();
	if (account)
		return NextResponse.json({ error: "Already registered" }, { status: 400 });
	let body = await request.json();
	// Expecting: section (string), year (2 or 3), gpa (number), fail (boolean)

	var section: unknown = body.section;
	let year: unknown = body.year ?? 2;
	let gpa: unknown = body.gpa;
	let fail: unknown = body.fail;

	if (!section || !year || !gpa || fail === undefined)
		return NextResponse.json({ error: "Missing fields" }, { status: 400 });

	if (
		typeof section !== "string" ||
		typeof year !== "number" ||
		typeof gpa !== "number" ||
		typeof fail !== "boolean"
	)
		return NextResponse.json({ error: "Invalid fields" }, { status: 400 });

	section = section.toUpperCase();

	if (!sections.includes(section as any))
		return NextResponse.json({ error: "Invalid section" }, { status: 400 });

	if (![2, 3].includes(year))
		return NextResponse.json({ error: "Invalid year" }, { status: 400 });

	if (gpa < 1 || gpa > 6)
		return NextResponse.json({ error: "Invalid GPA" }, { status: 400 });

	// Create user
	let user = await prisma.user.create({
		data: {
			name: them.user!.name!,
			email: them.user!.email!,
			image: them.user!.image!,

			section: section as Section,
			year: year == 3 ? Year.third : Year.second,
			gpa: gpa,
			fail,
		},
	});

	return NextResponse.json({ user });
}

// Update list of preferences
export async function PATCH(request: NextRequest) {
	// If not authed, return error
	let them = await auth();
	if (!them)
		return NextResponse.json({ error: "Not logged in" }, { status: 401 });

	// If already registered, return error
	let account = await prisma.user.findUnique({
		where: { email: them.user!.email! },
	});

	if (!account)
		return NextResponse.json({ error: "Not registered" }, { status: 401 });

	// Parse body
	let body = await request.json();

	let agreements = body.agreements;

	if (agreements !== undefined) {
		// Check that it's an array of strings
		if (
			!Array.isArray(agreements) ||
			agreements.some((a) => typeof a !== "string")
		)
			return NextResponse.json(
				{ error: "Invalid agreements" },
				{ status: 400 }
			);

		let docs = await Promise.all(
			agreements.map((id) =>
				prisma.agreement.findUnique({
					where: { id },
					include: { uni: true },
				})
			)
		);

		// If one of the agreements doesn't exist, return error
		if (docs.some((a) => !a))
			return NextResponse.json(
				{ error: "Invalid agreements" },
				{ status: 400 }
			);

		// Check that user indeed has access to all agreements
		if (docs.some((a) => !a!.sections.includes(account.section)))
			return NextResponse.json(
				{ error: "Invalid agreements" },
				{ status: 400 }
			);

		// If use doesn't have access to world exchanges && there's some, return error
		if (account.gpa < 5 && docs.some((a) => a!.uni.regionCode !== "EUR"))
			return NextResponse.json(
				{ error: "Agreements outside Europe" },
				{ status: 400 }
			);

		// Everything seems good, update user
		await prisma.user.update({
			where: { id: account.id },
			data: {
				agreements: {
					connect: docs.map((a) => ({ id: a!.id })),
				},
			},
		});
	}
}

// Delete account
export async function DELETE(request: NextRequest) {
	let user = await getAuthedUser();
	if (!user)
		return NextResponse.json({ error: "Not registered" }, { status: 401 });

	await prisma.user.delete({ where: { id: user.id } });
}

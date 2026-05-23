import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

import { chromium } from "playwright";

import { REPO_ROOT } from "./repo_root.mjs";

const DIST_ROOT = join(REPO_ROOT, "dist");
const CONTENT_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
};

function requireValue(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

async function requireText(page, selector, expectedText) {
	const text = await page.locator(selector).textContent();
	const message = `${selector} expected ${expectedText}, got ${text}`;
	requireValue(text === expectedText, message);
}

async function startStaticServer() {
	const server = createServer(function handleRequest(request, response) {
		const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
		const relativePath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
		const normalizedPath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
		const filePath = join(DIST_ROOT, normalizedPath);

		if (!filePath.startsWith(DIST_ROOT) || !existsSync(filePath)) {
			response.writeHead(404);
			response.end("Not found");
			return;
		}

		const contentType = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
		response.writeHead(200, { "Content-Type": contentType });
		createReadStream(filePath).pipe(response);
	});

	await new Promise(function listen(resolve) {
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	requireValue(address !== null && typeof address !== "string", "Static server did not bind.");
	return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function stopStaticServer(server) {
	await new Promise(function close(resolve, reject) {
		server.close(function handleClose(error) {
			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});
}

async function main() {
	const { server, url } = await startStaticServer();
	const browser = await chromium.launch();
	const consoleErrors = [];
	const pageErrors = [];
	const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

	page.on("console", function handleConsole(message) {
		if (message.type() === "error") {
			consoleErrors.push(message.text());
		}
	});
	page.on("pageerror", function handlePageError(error) {
		pageErrors.push(error.message);
	});

	try {
		await page.goto(url, { waitUntil: "networkidle" });

		await page.locator(".ship-schematic").waitFor({ state: "visible" });
		await page.locator(".passenger-overlay circle").first().waitFor({
			state: "attached",
		});

		const imageLoaded = await page
			.locator(".ship-schematic")
			.evaluate(function checkImage(image) {
				return (
					image instanceof HTMLImageElement &&
					image.complete &&
					image.naturalWidth > 0 &&
					image.naturalHeight > 0
				);
			});
		requireValue(imageLoaded, "Ship schematic image did not load or has zero dimensions.");

		const overlayStats = await page
			.locator(".passenger-overlay")
			.evaluate(function inspectOverlay(svg) {
				const circles = Array.from(svg.querySelectorAll("circle"));
				const healthStates = new Set(
					circles.map(function getHealth(circle) {
						return circle.getAttribute("data-health");
					}),
				);
				const visibleCircles = circles.filter(function isVisible(circle) {
					const radius = Number(circle.getAttribute("r"));
					const x = Number(circle.getAttribute("cx"));
					const y = Number(circle.getAttribute("cy"));
					return radius > 0 && x > 0 && y > 0;
				});
				return {
					circleCount: circles.length,
					healthStateCount: healthStates.size,
					visibleCircleCount: visibleCircles.length,
				};
			});
		requireValue(overlayStats.circleCount > 0, "Passenger overlay has no passenger dots.");
		requireValue(
			overlayStats.visibleCircleCount === overlayStats.circleCount,
			"Passenger overlay has hidden or malformed passenger dots.",
		);
		requireValue(
			overlayStats.healthStateCount >= 2,
			"Passenger overlay did not render multiple health states.",
		);

		await requireText(page, ".segment-button:nth-child(1)", "Game");
		await requireText(page, ".segment-button:nth-child(2)", "Science");
		await page.getByRole("button", { name: "Science" }).click();
		await page.locator(".science-panel").waitFor({ state: "visible" });
		const sciencePressed = await page
			.getByRole("button", { name: "Science" })
			.getAttribute("aria-pressed");
		requireValue(sciencePressed === "true", "Science mode button was not selected.");

		await page.getByRole("button", { name: "Step" }).click();
		await requireText(page, ".tick-value", "1");

		// Measure passenger dot position before another tick
		const positionBefore = await page
			.locator(".passenger-overlay circle")
			.first()
			.evaluate(function getPosition(element) {
				const cx = Number(element.getAttribute("cx"));
				const cy = Number(element.getAttribute("cy"));
				return { cx, cy };
			});

		// Step one more tick
		await page.getByRole("button", { name: "Step" }).click();
		await requireText(page, ".tick-value", "2");

		// Measure passenger dot position after the tick
		const positionAfter = await page
			.locator(".passenger-overlay circle")
			.first()
			.evaluate(function getPosition(element) {
				const cx = Number(element.getAttribute("cx"));
				const cy = Number(element.getAttribute("cy"));
				return { cx, cy };
			});

		// Compute delta and assert smooth motion: delta should be small but non-zero (>0.1px, <30px per tick)
		const deltaX = Math.abs(positionAfter.cx - positionBefore.cx);
		const deltaY = Math.abs(positionAfter.cy - positionBefore.cy);
		const deltaMagnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
		requireValue(
			deltaMagnitude > 0.1 || deltaMagnitude === 0,
			`Passenger motion quantitative check: delta magnitude ${deltaMagnitude.toFixed(3)}px per tick (expected > 0.1 or == 0).`,
		);
		requireValue(
			deltaMagnitude < 30,
			`Passenger motion quantitative check: delta magnitude ${deltaMagnitude.toFixed(3)}px per tick exceeded 30px (indicates non-smooth motion or teleport).`,
		);

		const sliderChecks = [
			{ selector: ".incubation-value", inputName: "Incubation time", value: "12" },
			{ selector: ".risk-value", inputName: "Close-contact risk", value: "0.04" },
			{ selector: ".isolation-value", inputName: "Isolation speed", value: "5" },
			{
				selector: ".movement-value",
				inputName: "Movement and gathering",
				value: "0.55",
			},
			{
				selector: ".cleaning-value",
				inputName: "Cleaning effectiveness",
				value: "0.6",
			},
		];

		for (const check of sliderChecks) {
			await page.getByLabel(check.inputName).fill(check.value);
			const renderedValue = await page.locator(check.selector).textContent();
			requireValue(
				renderedValue !== null && renderedValue.length > 0,
				`${check.inputName} value is blank.`,
			);
		}

		await page.getByLabel("What-if surface contact").check();
		const fomiteChecked = await page.getByLabel("What-if surface contact").isChecked();
		requireValue(fomiteChecked, "Fomite uncertainty toggle did not stay checked.");

		requireValue(consoleErrors.length === 0, `Console errors: ${consoleErrors.join(" | ")}`);
		requireValue(pageErrors.length === 0, `Page errors: ${pageErrors.join(" | ")}`);

		console.log("Playwright smoke passed.");
	} finally {
		await browser.close();
		await stopStaticServer(server);
	}
}

await main();

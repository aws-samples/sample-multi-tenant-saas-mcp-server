import { expect } from "@playwright/test";
import { test } from "./fixtures";

test.beforeEach(async ({ baseURL, page }) => {
	await page.goto(baseURL!);
});

test("should load tools", async ({ page, mcpServerUrl }) => {
	await page.getByRole("textbox", { name: "Enter MCP server URL" }).fill(mcpServerUrl);
	await page.getByRole("button", { name: "Connect" }).click();
	await expect(page.getByTestId("status")).toHaveText("Connected");
	await expect(page.getByRole("heading")).toContainText("Available Tools (2)");
});

test("should disable mcp server textbox while and after connecting", async ({
	page,
	mcpServerUrl,
}) => {
	const { promise, resolve } = Promise.withResolvers<void>();
	await page.route("**/mcp", async (route) => {
		// Simulate a delay to keep the textbox disabled
		await promise;
		await route.continue();
	});

	await page.getByRole("textbox", { name: "Enter MCP server URL" }).fill(mcpServerUrl);
	await Promise.all([
		page.waitForRequest(mcpServerUrl),
		page.getByRole("button", { name: "Connect" }).click(),
	]);

	await expect(page.getByTestId("status")).toHaveText("Connecting");
	await expect(page.getByRole("textbox", { name: "Enter MCP server URL" })).toBeDisabled();

	// now connection can be established
	resolve();

	await expect(page.getByTestId("status")).toHaveText("Connected");
	// textbox should still be disabled
	await expect(page.getByRole("textbox", { name: "Enter MCP server URL" })).toBeDisabled();
});

test("should not trigger new connection after a failed connection while typing mcp server textbox", async ({
	page,
	mcpServerUrl,
}) => {
	// simulate a connection failure
	await page
		.getByRole("textbox", { name: "Enter MCP server URL" })
		.fill(mcpServerUrl.replace("/mcp", "/invalid"));
	await page.getByRole("button", { name: "Connect" }).click();
	await expect(page.getByTestId("status")).toHaveText("Failed");

	// now typing in the textbox should not trigger a new connection
	await page.getByRole("textbox", { name: "Enter MCP server URL" }).fill(mcpServerUrl);

	await page.waitForTimeout(500); // wait to ensure no new request is made

	await expect(page.getByTestId("status")).not.toHaveText(/^(Connecting|Connected)$/);
});

test("should trigger new connection after a failed connection when connect button is clicked", async ({
	page,
	mcpServerUrl,
}) => {
	// simulate a connection failure
	await page
		.getByRole("textbox", { name: "Enter MCP server URL" })
		.fill(mcpServerUrl.replace("mcp", "invalid"));
	await page.getByRole("button", { name: "Connect" }).click();
	await expect(page.getByTestId("status")).toHaveText("Failed");

	// now typing in the textbox and click connect should establish a new connection
	await page.getByRole("textbox", { name: "Enter MCP server URL" }).fill(mcpServerUrl);
	await page.getByRole("button", { name: "Connect" }).click();
	await expect(page.getByTestId("status")).toHaveText("Connected");
});

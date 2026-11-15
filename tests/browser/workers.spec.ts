import { expect, test, type Page } from "@playwright/test";

async function section(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Research navigation" })
    .getByRole("link", { name, exact: true })
    .click();
}

for (const algorithm of ["conventional", "occupancy", "bitmask", "symmetry"]) {
  test(`${algorithm} worker, playback, real steps, and solution exploration`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()}: ${response.url()}`);
    });
    await page.goto("/#solver");
    await page
      .getByRole("combobox", { name: "Algorithm", exact: true })
      .selectOption(algorithm);
    await page
      .getByRole("button", { name: "Start visualization", exact: true })
      .click();
    await expect(
      page.getByText("92 total solutions", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page
      .getByRole("button", { name: "First recorded step", exact: true })
      .click();
    await expect(page.locator(".board .occupied")).toHaveCount(0);
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(page.locator(".board .occupied")).toHaveCount(1);
    await expect(page.locator(".board .active-row")).toHaveCount(8);
    await expect(page.locator(".event-status")).toContainText(
      "row 1, column 1",
    );
    await page
      .getByRole("button", { name: "Previous step", exact: true })
      .click();
    await expect(page.locator(".board .occupied")).toHaveCount(0);
    const slider = page.getByRole("slider", { name: "Playback speed" });
    await slider.focus();
    await slider.press("End");
    await expect(slider).toHaveValue("100");
    await expect(page).toHaveURL(/#solver$/);
    await page
      .getByRole("button", { name: "Last recorded step", exact: true })
      .click();
    await expect(page.locator(".board .occupied")).toHaveCount(0);
    await page.getByLabel("Explore recorded solutions").selectOption("0");
    await expect(page.locator(".board .occupied")).toHaveCount(8);
    await expect(
      page
        .locator(".live-metrics > div")
        .filter({ hasText: "Solutions discovered" })
        .locator("strong"),
    ).toHaveText("92");
    if (algorithm === "symmetry")
      await expect(
        page.getByText("Mirror counting:", { exact: false }),
      ).toBeVisible();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reset visualization", exact: true })
      .click();
    await expect(page.locator(".board .occupied")).toHaveCount(0);
    await page.getByRole("combobox", { name: /Board size/ }).selectOption("5");
    await page
      .getByRole("button", { name: "Start visualization", exact: true })
      .click();
    await expect(
      page.getByText("10 total solutions", { exact: false }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("benchmark measurements, charts, and complete exports", async ({
  page,
}) => {
  await page.goto("/#comparison");
  await page.getByLabel("Starting board size").selectOption("4");
  await page.getByLabel("Ending board size").selectOption("5");
  await page.getByLabel("Repetitions").selectOption("3");
  await page.getByLabel("Timeout per execution").selectOption("5");
  await page.getByLabel("Bitmask + symmetry", { exact: true }).uncheck();
  await page.getByLabel("Bitmask + symmetry", { exact: true }).check();
  await page
    .getByRole("button", { name: "Run benchmark", exact: true })
    .click();
  await expect(
    page.getByText("Completed 24 measured trials.", { exact: false }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator("tbody tr")).toHaveCount(8);
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON", exact: true }).click(),
  ]);
  const stream = await jsonDownload.createReadStream();
  let json = "";
  for await (const chunk of stream!) json += chunk;
  const exported = JSON.parse(json);
  expect(exported.results).toHaveLength(8);
  expect(exported.configuration.source).toContain("Visitor-generated");
  for (const result of exported.results) {
    expect(result.times).toHaveLength(3);
    expect(result.metrics.solutions).toBe(result.n === 4 ? 2 : 10);
    expect(result.median).toBeGreaterThanOrEqual(0);
  }
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV", exact: true }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe("nqueens-benchmark.csv");
  await section(page, "Results");
  await expect(
    page.getByRole("heading", { name: "Execution time", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".chart-panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Search nodes explored",
          exact: true,
        }),
      })
      .locator(".recharts-bar-rectangle path")
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Scalability across board sizes" }),
  ).toBeAttached();
  await expect(page.locator("tbody tr")).toHaveCount(8);
});

test("benchmark cancellation and invalid range are explicit", async ({
  page,
}) => {
  await page.goto("/#comparison");
  await page.getByLabel("Starting board size").selectOption("14");
  await page.getByLabel("Ending board size").selectOption("4");
  await page.getByRole("button", { name: "Run benchmark" }).click();
  await expect(page.getByRole("alert")).toContainText("valid board-size range");
  await page.getByLabel("Ending board size").selectOption("14");
  await page.getByRole("button", { name: "Run benchmark" }).click();
  await page.getByRole("button", { name: "Cancel experiment" }).click();
  await expect(page.getByRole("alert")).toContainText("Cancelled");
  await expect(page.locator("tbody tr")).toHaveCount(0);
});

test("blocked worker loading shows an actionable error and reset recovers", async ({
  page,
}) => {
  const workerEntry = /solver\.worker.*(?:worker_file|\.js)/;
  await page.route(workerEntry, (route) => route.abort());
  await page.goto("/#solver");
  await page
    .getByRole("button", { name: "Start visualization", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Worker failed to load or execute",
  );
  await page.unroute(workerEntry);
  await page.getByRole("button", { name: "Reset visualization" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Start visualization", exact: true })
    .click();
  await expect(
    page.getByText("92 total solutions", { exact: false }),
  ).toBeVisible();
});

test("research navigation, history, direct links, fullscreen, and theme", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Interactive Solver", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /See how it works|Next slide|Restart presentation|demonstration/,
    }),
  ).toHaveCount(0);
  await section(page, "Comparison");
  await expect(page).toHaveURL(/#comparison$/);
  await section(page, "Results");
  await expect(page).toHaveURL(/#dashboard$/);
  await page.goBack();
  await expect(page).toHaveURL(/#comparison$/);
  await page.goForward();
  await expect(page).toHaveURL(/#dashboard$/);
  await section(page, "Methodology");
  await expect(
    page.getByRole("heading", { name: "Research Methodology", exact: true }),
  ).toBeVisible();
  await section(page, "Solver");
  await expect(page).toHaveURL(/#solver$/);
  await page.locator("main").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/#solver$/);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.getByRole("button", { name: "Toggle fullscreen" }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(true);
  await page.getByRole("button", { name: "Toggle fullscreen" }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.fullscreenElement)))
    .toBe(false);
  await page.goto("/#slide-3");
  await expect(
    page.getByRole("heading", { name: "Interactive Solver", exact: true }),
  ).toBeVisible();
});

test("browser correctness verification runs all four methods through N=14", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/#methodology");
  await page.getByRole("button", { name: "Verify algorithms" }).click();
  await page.getByRole("button", { name: "Cancel verification" }).click();
  await expect(page.getByRole("status")).toContainText("Cancelled");
  await page.getByRole("button", { name: "Verify algorithms" }).click();
  await expect(page.getByRole("status")).toContainText("60/60 passed", {
    timeout: 100000,
  });
});

test("research workspaces fit desktop, tablet, and mobile without overflow", async ({
  page,
}) => {
  test.setTimeout(90000);
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    for (const route of ["solver", "comparison", "dashboard", "methodology"]) {
      await page.goto("/#" + route);
      await expect(page.locator(".workspace-heading")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        stage: document.querySelector("main")!.scrollWidth,
        stageClient: document.querySelector("main")!.clientWidth,
      }));
      expect(
        dimensions.document,
        "page " + route + " at width " + width,
      ).toBeLessThanOrEqual(width + 1);
      expect(
        dimensions.stage,
        "content " + route + " at width " + width,
      ).toBeLessThanOrEqual(dimensions.stageClient + 1);
      if (route === "solver") {
        const board = await page.locator(".board").boundingBox();
        expect(board!.width).toBeGreaterThan(width < 580 ? 200 : 300);
        if (width === 1440 || width === 390) {
          await page
            .getByRole("button", { name: "Reset visualization" })
            .click();
          await page
            .getByRole("button", { name: "Start visualization", exact: true })
            .click();
          await expect(
            page.getByText("92 total solutions", { exact: false }),
          ).toBeVisible();
          await page.getByLabel("Explore recorded solutions").selectOption("0");
          await page.locator("main").evaluate((el) => el.scrollTo({ top: 0 }));
          await page.screenshot({
            path:
              "test-results/research-" +
              test.info().project.name +
              "-" +
              width +
              "-solver.png",
            animations: "disabled",
          });
        }
      }
    }
  }
});

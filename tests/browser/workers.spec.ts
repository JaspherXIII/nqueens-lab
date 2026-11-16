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
  expect(exported.status).toBe("completed");
  expect(exported.trials).toHaveLength(24);
  expect(exported.configuration.selectedAlgorithms).toEqual([
    "conventional",
    "occupancy",
    "bitmask",
    "symmetry",
  ]);
  expect(
    exported.trials.slice(0, 8).map((t: { algorithm: string }) => t.algorithm),
  ).toEqual([
    "conventional",
    "occupancy",
    "bitmask",
    "symmetry",
    "occupancy",
    "bitmask",
    "symmetry",
    "conventional",
  ]);
  expect(
    exported.trials.every((t: { status: string }) => t.status === "success"),
  ).toBe(true);
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
  const csvStream = await csvDownload.createReadStream();
  let csv = "";
  for await (const chunk of csvStream!) csv += chunk;
  expect(
    csv
      .replace(/^\uFEFF/, "")
      .startsWith('"experiment_id","experiment_status"'),
  ).toBe(true);
  expect(csv.split("\r\n")).toHaveLength(25);
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

test("significant event jumps, timeline, fast-forward and truncated playback retain full results", async ({
  page,
}) => {
  await page.goto("/#solver");
  await page.getByRole("combobox", { name: /Board size/ }).selectOption("10");
  await page
    .getByRole("button", { name: "Start visualization", exact: true })
    .click();
  await expect(
    page.getByText("724 total solutions", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByText("Playback shows the first 20,000 events", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "First recorded step" }).click();
  await page.getByLabel("Jump to event").selectOption("solution");
  await page
    .getByRole("button", { name: "Next significant event", exact: true })
    .click();
  await expect(page.locator(".event-status")).toHaveText(/Solution found/);
  await expect(page.locator(".board .occupied")).toHaveCount(10);
  const firstSolution = await page
    .getByRole("slider", { name: "Recorded playback progress" })
    .inputValue();
  await page
    .getByRole("button", { name: "Next significant event", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Previous significant event", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Recorded playback progress" }),
  ).toHaveValue(firstSolution);
  await page.getByLabel("Jump to event").selectOption("remove");
  await page
    .getByRole("button", { name: "Next significant event", exact: true })
    .click();
  await expect(page.locator(".event-status")).toHaveText(/Backtracking/);
  await expect(page.locator(".removed-queen")).toHaveCount(1);
  await page.getByRole("button", { name: "First recorded step" }).click();
  await page.getByLabel("Jump to event").selectOption("place");
  await page
    .getByRole("button", { name: "Next significant event", exact: true })
    .click();
  await expect(page.locator(".board .occupied")).toHaveCount(1);
  const speed = page.getByRole("slider", { name: "Playback speed" });
  await speed.focus();
  await speed.press("End");
  await page.getByRole("button", { name: "Fast-forward playback" }).click();
  await expect(
    page.getByRole("button", { name: "Fast-forward playback" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        await page
          .getByRole("slider", { name: "Recorded playback progress" })
          .inputValue(),
      ),
    )
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "Last recorded step" }).click();
  await expect(
    page.getByRole("slider", { name: "Recorded playback progress" }),
  ).toHaveValue("19999");
  await expect(
    page.getByText("724 total solutions", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset visualization" }).click();
  await expect(
    page.getByRole("slider", { name: "Recorded playback progress" }),
  ).toBeDisabled();
  await expect(page.locator(".board .occupied")).toHaveCount(0);
});

test("timed-out trial logs remain exportable without valid timing groups", async ({
  page,
}) => {
  await page.route(/solver\.worker.*(?:worker_file|\.js)/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'self.onmessage = () => self.postMessage({error: "Warm-up timed out; no measurement recorded."});',
    }),
  );
  await page.goto("/#comparison");
  await page.getByLabel("Starting board size").selectOption("4");
  await page.getByLabel("Ending board size").selectOption("4");
  await page.getByLabel("Repetitions").selectOption("1");
  await page
    .getByRole("button", { name: "Run benchmark", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("4 timed-out trials");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON", exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  let text = "";
  for await (const chunk of stream!) text += chunk;
  const exported = JSON.parse(text);
  expect(exported.status).toBe("completed_with_errors");
  expect(exported.results).toHaveLength(0);
  expect(
    exported.trials.every(
      (t: { status: string; elapsed: number | null }) =>
        t.status === "timed_out" && t.elapsed === null,
    ),
  ).toBe(true);
});

test("populated charts, results and primary playback controls fit requested viewports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/#comparison");
  await page.getByLabel("Starting board size").selectOption("4");
  await page.getByLabel("Ending board size").selectOption("6");
  await page
    .getByRole("button", { name: "Run benchmark", exact: true })
    .click();
  await expect(
    page.getByText("Completed 36 measured trials.", { exact: false }),
  ).toBeVisible();
  for (const [width, height] of [
    [1440, 900],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await section(page, "Results");
    await expect(page.locator("tbody tr")).toHaveCount(12);
    await expect(
      page.getByRole("heading", { name: "Execution time", exact: true }),
    ).toBeVisible();
    expect(await page.locator(".recharts-errorBars").count()).toBeGreaterThan(
      0,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    const overflow = await page
      .locator("main")
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `test-results/improved-${test.info().project.name}-${width}-results.png`,
      animations: "disabled",
    });
    await section(page, "Solver");
    const primary = await page
      .getByRole("button", { name: "Start visualization", exact: true })
      .boundingBox();
    if (width === 390)
      expect(primary!.y + primary!.height).toBeLessThan(height - 38);
    await expect
      .poll(() =>
        page.evaluate(() => document.fonts.check('400 16px "Inter Variable"')),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Start visualization", exact: true })
      .click();
    await expect(
      page.getByText("92 total solutions", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("Explore recorded solutions").selectOption("0");
    await expect(page.locator(".board .occupied")).toHaveCount(8);
    await page.locator("main").evaluate((el) => el.scrollTo({ top: 0 }));
    await page.screenshot({
      path: `test-results/improved-${test.info().project.name}-${width}-solver.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await page.screenshot({
      path: `test-results/improved-${test.info().project.name}-${width}-dark-solver.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await page.getByRole("button", { name: "Reset visualization" }).click();
  }
  expect(errors).toEqual([]);
});

test("reset cancels a preparing worker and a new solver run recovers", async ({
  page,
}) => {
  const workerEntry = /solver\.worker.*(?:worker_file|\.js)/;
  await page.route(workerEntry, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "self.onmessage = () => {};",
    }),
  );
  await page.goto("/#solver");
  await page
    .getByRole("button", { name: "Start visualization", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preparing…", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reset visualization" }).click();
  await expect(
    page.getByRole("button", { name: "Start visualization", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.unroute(workerEntry);
  await page.getByRole("combobox", { name: /Board size/ }).selectOption("5");
  await page
    .getByRole("button", { name: "Start visualization", exact: true })
    .click();
  await expect(
    page.getByText("10 total solutions", { exact: false }),
  ).toBeVisible();
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
        overflow: [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 12)
          .map((el) => ({
            element: el.className,
            width: el.getBoundingClientRect().width,
            right: el.getBoundingClientRect().right,
          })),
      }));
      expect(
        dimensions.document,
        "page " +
          route +
          " at width " +
          width +
          ": " +
          JSON.stringify(dimensions.overflow),
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

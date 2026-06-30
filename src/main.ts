import {
  App,
  HeadingCache,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  debounce,
  moment
} from "obsidian";

interface OutlineMinimapSettings {
  maxHeadingLevel: number;
  maxTopLevelSections: number;
  surroundingHeadingCount: number;
  showEmptyState: boolean;
  outlineWidth: number;
  topOffset: number;
  backgroundOpacity: number;
  backgroundBlur: number;
}

interface HeadingItem {
  text: string;
  level: number;
  line: number;
}

type TranslationKey =
  | "settingsTitle"
  | "noHeadings"
  | "jumpToHeading"
  | "displayedHeadingDepthName"
  | "displayedHeadingDepthDesc"
  | "topLevelSectionLimitName"
  | "topLevelSectionLimitDesc"
  | "surroundingHeadingCountName"
  | "surroundingHeadingCountDesc"
  | "showEmptyStateName"
  | "showEmptyStateDesc"
  | "outlineWidthName"
  | "outlineWidthDesc"
  | "topOffsetName"
  | "topOffsetDesc"
  | "backgroundOpacityName"
  | "backgroundOpacityDesc"
  | "backgroundBlurName"
  | "backgroundBlurDesc";

const TRANSLATIONS: Record<"en" | "ja", Record<TranslationKey, string>> = {
  en: {
    settingsTitle: "Outline Minimap",
    noHeadings: "No headings",
    jumpToHeading: "Jump to {{heading}}",
    displayedHeadingDepthName: "Displayed heading depth",
    displayedHeadingDepthDesc: "Choose the deepest heading level to show in the minimap.",
    topLevelSectionLimitName: "Top-level section limit",
    topLevelSectionLimitDesc: "Show headings only through the first N H1 sections. Set to 0 for no limit.",
    surroundingHeadingCountName: "Surrounding heading count",
    surroundingHeadingCountDesc: "Show only this many headings before and after the current heading. Set to 0 to show all.",
    showEmptyStateName: "Show empty state",
    showEmptyStateDesc: "Show a subtle message when the active note has no headings.",
    outlineWidthName: "Outline width",
    outlineWidthDesc: "Set the minimap width in pixels.",
    topOffsetName: "Top offset",
    topOffsetDesc: "Set the minimap distance from the top of the pane in pixels.",
    backgroundOpacityName: "Background opacity",
    backgroundOpacityDesc: "Set the minimap background opacity.",
    backgroundBlurName: "Background blur",
    backgroundBlurDesc: "Set the frosted-glass blur behind the minimap. Use 0 for a crisp background."
  },
  ja: {
    settingsTitle: "Outline Minimap",
    noHeadings: "見出しがありません",
    jumpToHeading: "{{heading}} へ移動",
    displayedHeadingDepthName: "表示する見出し深度",
    displayedHeadingDepthDesc: "ミニマップに表示する最も深い見出しレベルを選びます。",
    topLevelSectionLimitName: "H1 セクション数の上限",
    topLevelSectionLimitDesc: "上から何個目の H1 セクションまで表示するかを指定します。0 にすると無制限です。",
    surroundingHeadingCountName: "現在位置の前後に表示する見出し数",
    surroundingHeadingCountDesc: "現在の見出しの前後に表示する見出し数を指定します。0 にするとすべて表示します。",
    showEmptyStateName: "空状態を表示",
    showEmptyStateDesc: "現在のノートに見出しがないとき、控えめなメッセージを表示します。",
    outlineWidthName: "アウトライン幅",
    outlineWidthDesc: "ミニマップの幅をピクセル単位で設定します。",
    topOffsetName: "上からの位置",
    topOffsetDesc: "ペイン上端からミニマップまでの距離をピクセル単位で設定します。",
    backgroundOpacityName: "背景の透明度",
    backgroundOpacityDesc: "ミニマップ背景の不透明度を設定します。",
    backgroundBlurName: "背景のぼかし",
    backgroundBlurDesc: "ミニマップ背後のすりガラス風ぼかし量を設定します。0 にするとくっきり表示されます。"
  }
};

function t(key: TranslationKey, params: Record<string, string> = {}): string {
  const locale = moment.locale().toLowerCase().startsWith("ja") ? "ja" : "en";
  let text = TRANSLATIONS[locale][key];

  for (const [paramKey, value] of Object.entries(params)) {
    text = text.split(`{{${paramKey}}}`).join(value);
  }

  return text;
}

const DEFAULT_SETTINGS: OutlineMinimapSettings = {
  maxHeadingLevel: 3,
  maxTopLevelSections: 0,
  surroundingHeadingCount: 0,
  showEmptyState: true,
  outlineWidth: 180,
  topOffset: 72,
  backgroundOpacity: 88,
  backgroundBlur: 0
};

export default class OutlineMinimapPlugin extends Plugin {
  settings: OutlineMinimapSettings;
  private minimapEl: HTMLElement | null = null;
  private activeView: MarkdownView | null = null;
  private activeScroller: HTMLElement | null = null;
  private headings: HeadingItem[] = [];
  private activeIndex = -1;
  private readonly refresh = debounce(() => this.renderForActiveView(), 50, true);
  private readonly updateActiveHeading = debounce(() => this.syncActiveHeading(), 80, true);
  private readonly scrollHandler = () => this.updateActiveHeading();

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new OutlineMinimapSettingTab(this.app, this));

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refresh()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.refresh()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.refresh()));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      if (file === this.activeView?.file) {
        this.refresh();
      }
    }));

    this.app.workspace.onLayoutReady(() => this.refresh());
  }

  onunload() {
    this.removeMinimap();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refresh();
  }

  private renderForActiveView() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) {
      this.removeMinimap();
      return;
    }

    if (this.activeView !== view) {
      this.removeMinimap();
      this.activeView = view;
    }

    this.headings = this.getHeadings(view.file);

    if (!this.headings.length && !this.settings.showEmptyState) {
      this.removeMinimap();
      return;
    }

    this.ensureMinimap(view);
    this.activeIndex = this.getActiveIndex(view);
    this.renderHeadings();
  }

  private getHeadings(file: TFile): HeadingItem[] {
    const cache = this.app.metadataCache.getFileCache(file);
    const headings = cache?.headings ?? [];
    const sectionEndLine = this.getTopLevelSectionEndLine(headings);

    return headings
      .filter((heading) => sectionEndLine === null || heading.position.start.line < sectionEndLine)
      .filter((heading) => heading.level <= this.settings.maxHeadingLevel)
      .map((heading) => ({
        text: heading.heading,
        level: heading.level,
        line: heading.position.start.line
      }));
  }

  private getTopLevelSectionEndLine(headings: HeadingCache[]): number | null {
    const limit = this.settings.maxTopLevelSections;
    if (limit <= 0) {
      return null;
    }

    const h1Headings = headings.filter((heading) => heading.level === 1);
    return h1Headings[limit]?.position.start.line ?? null;
  }

  private ensureMinimap(view: MarkdownView) {
    const container = view.containerEl;
    container.addClass("outline-minimap-host");

    if (!this.minimapEl || !this.minimapEl.isConnected) {
      this.minimapEl = container.createDiv({ cls: "outline-minimap" });
      this.registerDomEvent(this.minimapEl, "click", (event) => this.handleClick(event));
      this.registerDomEvent(this.minimapEl, "keydown", (event) => this.handleKeydown(event));
    }

    this.minimapEl.style.setProperty("--outline-minimap-width", `${this.settings.outlineWidth}px`);
    this.minimapEl.style.setProperty("--outline-minimap-top", `${this.settings.topOffset}px`);
    this.minimapEl.style.setProperty("--outline-minimap-background-opacity", `${this.settings.backgroundOpacity}%`);
    this.minimapEl.style.setProperty("--outline-minimap-background-blur", `${this.settings.backgroundBlur}px`);

    const scroller = this.getScroller(view);
    if (scroller && scroller !== this.activeScroller) {
      this.activeScroller?.removeEventListener("scroll", this.scrollHandler);
      this.activeScroller = scroller;
      this.activeScroller.addEventListener("scroll", this.scrollHandler, { passive: true });
    }
  }

  private renderHeadings() {
    if (!this.minimapEl) return;

    this.minimapEl.empty();
    this.minimapEl.toggleClass("is-empty", this.headings.length === 0);

    if (!this.headings.length) {
      this.minimapEl.createDiv({
        cls: "outline-minimap-empty",
        text: t("noHeadings")
      });
      return;
    }

    for (const { heading, index } of this.getDisplayedHeadings()) {
      const item = this.minimapEl.createDiv({
        cls: `outline-minimap-item is-level-${heading.level}`,
        attr: {
          role: "button",
          tabindex: "0",
          "data-index": String(index),
          "aria-label": t("jumpToHeading", { heading: heading.text }),
          title: heading.text
        }
      });

      item.toggleClass("is-active", index === this.activeIndex);

      item.createSpan({ cls: "outline-minimap-marker" });
      item.createSpan({
        cls: "outline-minimap-label",
        text: heading.text
      });
    }
  }

  private handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>(".outline-minimap-item");
    if (!item) return;

    const index = Number(item.dataset.index);
    this.jumpToHeading(index);
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;

    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>(".outline-minimap-item");
    if (!item) return;

    event.preventDefault();
    const index = Number(item.dataset.index);
    this.jumpToHeading(index);
  }

  private jumpToHeading(index: number) {
    const view = this.activeView;
    const heading = this.headings[index];
    if (!view || !heading) return;

    if (view.getMode() !== "source") {
      view.setState({ ...view.getState(), mode: "source" }, { history: false });
    }

    view.editor.setCursor({ line: heading.line, ch: 0 });
    view.editor.scrollIntoView({
      from: { line: heading.line, ch: 0 },
      to: { line: heading.line, ch: 0 }
    }, true);
    view.editor.focus();

    this.setActiveIndex(index);
  }

  private syncActiveHeading() {
    const view = this.activeView;
    if (!view || !this.headings.length) {
      this.setActiveIndex(-1);
      return;
    }

    this.setActiveIndex(this.getActiveIndex(view));
  }

  private setActiveIndex(index: number) {
    if (this.activeIndex === index) return;

    this.activeIndex = index;

    if (!this.minimapEl) return;

    if (this.settings.surroundingHeadingCount > 0) {
      this.renderHeadings();
      return;
    }

    this.minimapEl.findAll(".outline-minimap-item").forEach((item, itemIndex) => {
      item.toggleClass("is-active", itemIndex === index);
    });
  }

  private getActiveIndex(view: MarkdownView): number {
    if (!this.headings.length) {
      return -1;
    }

    const cursorLine = this.getVisibleStartLine(view) ?? view.editor.getCursor().line;
    let nextIndex = 0;

    for (let index = 0; index < this.headings.length; index++) {
      if (this.headings[index].line <= cursorLine) {
        nextIndex = index;
      } else {
        break;
      }
    }

    return nextIndex;
  }

  private getDisplayedHeadings(): Array<{ heading: HeadingItem; index: number }> {
    const radius = this.settings.surroundingHeadingCount;
    const activeIndex = Math.max(this.activeIndex, 0);

    if (radius <= 0 || this.headings.length <= radius * 2 + 1) {
      return this.headings.map((heading, index) => ({ heading, index }));
    }

    const start = Math.max(0, activeIndex - radius);
    const end = Math.min(this.headings.length, activeIndex + radius + 1);

    return this.headings
      .slice(start, end)
      .map((heading, offset) => ({ heading, index: start + offset }));
  }

  private getScroller(view: MarkdownView): HTMLElement | null {
    return view.containerEl.querySelector(".cm-scroller, .markdown-reading-view .markdown-preview-view");
  }

  private getVisibleStartLine(view: MarkdownView): number | null {
    const editor = view.editor as unknown as {
      cm?: {
        scrollDOM?: HTMLElement;
        lineBlockAtHeight?: (height: number) => { from: number };
        state?: {
          doc?: {
            lineAt: (position: number) => { number: number };
          };
        };
      };
    };
    const cm = editor.cm;

    if (!cm?.scrollDOM || !cm.lineBlockAtHeight || !cm.state?.doc) {
      return null;
    }

    const block = cm.lineBlockAtHeight(cm.scrollDOM.scrollTop + 24);
    return cm.state.doc.lineAt(block.from).number - 1;
  }

  private removeMinimap() {
    this.activeScroller?.removeEventListener("scroll", this.scrollHandler);
    this.activeScroller = null;
    this.minimapEl?.remove();
    this.minimapEl = null;
    this.activeView?.containerEl.removeClass("outline-minimap-host");
    this.activeView = null;
    this.headings = [];
    this.activeIndex = -1;
  }
}

class OutlineMinimapSettingTab extends PluginSettingTab {
  plugin: OutlineMinimapPlugin;

  constructor(app: App, plugin: OutlineMinimapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: t("settingsTitle") });

    new Setting(containerEl)
      .setName(t("displayedHeadingDepthName"))
      .setDesc(t("displayedHeadingDepthDesc"))
      .addDropdown((dropdown) => {
        for (let level = 1; level <= 6; level++) {
          dropdown.addOption(String(level), `H1-H${level}`);
        }

        dropdown
          .setValue(String(this.plugin.settings.maxHeadingLevel))
          .onChange(async (value) => {
            this.plugin.settings.maxHeadingLevel = Number(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("topLevelSectionLimitName"))
      .setDesc(t("topLevelSectionLimitDesc"))
      .addSlider((slider) => {
        slider
          .setLimits(0, 20, 1)
          .setValue(this.plugin.settings.maxTopLevelSections)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxTopLevelSections = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("surroundingHeadingCountName"))
      .setDesc(t("surroundingHeadingCountDesc"))
      .addSlider((slider) => {
        slider
          .setLimits(0, 12, 1)
          .setValue(this.plugin.settings.surroundingHeadingCount)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.surroundingHeadingCount = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("showEmptyStateName"))
      .setDesc(t("showEmptyStateDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.showEmptyState)
          .onChange(async (value) => {
            this.plugin.settings.showEmptyState = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("outlineWidthName"))
      .setDesc(t("outlineWidthDesc"))
      .addSlider((slider) => {
        slider
          .setLimits(96, 280, 4)
          .setValue(this.plugin.settings.outlineWidth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.outlineWidth = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("topOffsetName"))
      .setDesc(t("topOffsetDesc"))
      .addSlider((slider) => {
        slider
          .setLimits(16, 180, 4)
          .setValue(this.plugin.settings.topOffset)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.topOffset = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("backgroundOpacityName"))
      .setDesc(t("backgroundOpacityDesc"))
      .addSlider((slider) => {
        slider
          .setLimits(0, 100, 1)
          .setValue(this.plugin.settings.backgroundOpacity)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.backgroundOpacity = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("backgroundBlurName"))
      .setDesc(t("backgroundBlurDesc"))
      .addSlider((slider) => {
        slider
          .setLimits(0, 20, 1)
          .setValue(this.plugin.settings.backgroundBlur)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.backgroundBlur = value;
            await this.plugin.saveSettings();
          });
      });
  }
}

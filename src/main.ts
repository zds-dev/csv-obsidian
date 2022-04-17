import {
	addIcon, ButtonComponent, debounce,
	MarkdownRenderer,
	MarkdownView, Notice,
	Plugin,
	Setting,
	TextFileView, TFile, TFolder,
	ToggleComponent, View,
	WorkspaceLeaf,
} from "obsidian";
import * as Papa from "papaparse";
import Handsontable from "handsontable";
import "handsontable/dist/handsontable.full.min.css";
import "./styles.scss";
import {ParseError, ParseMeta, ParseResult} from "papaparse";
import {error} from "handsontable/helpers";

function CreateEmptyCSV(row = 1, col = 1): string{
	let csv = "";
	for (let x = 0; x < col; x++) {
		for (let y = 0; y < row; y++) {
			csv += "\"\"";
			if (y<row-1) csv += ",";
		}
		csv += "\n";
	}
	return csv;
}

export default class CsvPlugin extends Plugin {

	async onload() {
		//Create menu button to create a CSV
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if(file instanceof TFolder){
					const folder = file as TFolder;
					menu.addItem((item) => {
						item
							.setTitle("New CSV file")
							.setIcon("document")
							.onClick(async () => {
								//Searching if there is not already csv files named "Untitled".
								let index = 0;
								for (const child of folder.children) {
									if (child instanceof TFile){
										const file = child as TFile;
										if (file.extension === "csv" && file.basename.contains("Untitled")){
											const split = file.basename.split(" ");
											if (split.length > 1 && !isNaN(parseInt(split[1]))){
												const i = parseInt(split[1]);
												index = i >= index ? i+1:index;
											} else {
												index = index > 0 ? index : 1;
											}
										}
									}
								}
								//Creating the file.
								const fileName = `Untitled${index>0?` ${index}`:""}`;
								await this.app.vault.create(folder.path+`/${fileName}.csv`, CreateEmptyCSV(4,4));
								new Notice(`The file "${fileName}" has been created in the folder "${folder.path}".`);

								// We're not opening the file as it cause error.
								// await this.app.workspace.activeLeaf.openFile(file);
							});
					});
				}
			})
		);

		// register a custom icon
		this.addDocumentIcon("csv");

		// register the view and extensions
		this.registerView("csv", this.csvViewCreator);
		this.registerExtensions(["csv"], "csv");
	}

	// function to create the view
	csvViewCreator = (leaf: WorkspaceLeaf) => {
		return new CsvView(leaf);
	};

	// this function used the regular 'document' svg,
	// but adds the supplied extension into the icon as well
	addDocumentIcon = (extension: string) => {
		addIcon(`document-${extension}`, `
  <path fill="currentColor" stroke="currentColor" d="M14,4v92h72V29.2l-0.6-0.6l-24-24L60.8,4L14,4z M18,8h40v24h24v60H18L18,8z M62,10.9L79.1,28H62V10.9z"></path>
  <text font-family="sans-serif" font-weight="bold" font-size="30" fill="currentColor" x="50%" y="60%" dominant-baseline="middle" text-anchor="middle">
    ${extension}
  </text>
    `);
	};
}

// This is the custom view
class CsvView extends TextFileView {
	autoSaveToggle: ToggleComponent;
	saveButton: ButtonComponent;
	autoSaveValue: boolean;
	parseResult: ParseResult<string[]>;
	headerToggle: ToggleComponent;
	headers: string[] = null;
	fileOptionsEl: HTMLElement;
	hot: Handsontable;
	hotSettings: Handsontable.GridSettings;
	hotExport: Handsontable.plugins.ExportFile;
	hotState: Handsontable.plugins.PersistentState;
	hotFilters: Handsontable.plugins.Filters;
	loadingBar: HTMLElement;

	// this.contentEl is not exposed, so cheat a bit.
	public get extContentEl(): HTMLElement {
		return this.contentEl;
	}

	// constructor
	constructor(leaf: WorkspaceLeaf) {
		//Calling the parent constructor
		super(leaf);
		this.autoSaveValue = true;
		this.onResize = () => {
			//@ts-ignore - this.hot.view not recognized.
			this.hot.view.wt.wtOverlays.updateMainScrollableElements();
			this.hot.render();
		};
		this.loadingBar = document.createElement("div");
		this.loadingBar.addClass("progress-bar");
		this.loadingBar.innerHTML = "<div class=\"progress-bar-message u-center-text\">Loading CSV...</div><div class=\"progress-bar-indicator\"><div class=\"progress-bar-line\"></div><div class=\"progress-bar-subline\" style=\"display: none;\"></div><div class=\"progress-bar-subline mod-increase\"></div><div class=\"progress-bar-subline mod-decrease\"></div></div>";
		this.extContentEl.appendChild(this.loadingBar);

		this.fileOptionsEl = document.createElement("div");
		this.fileOptionsEl.classList.add("csv-controls");
		this.extContentEl.appendChild(this.fileOptionsEl);

		//Creating a toggle to set the header
		new Setting(this.fileOptionsEl)
			.setName("File Includes Headers")
			.addToggle(toggle => {
				this.headerToggle = toggle;
				toggle.setValue(false).onChange(this.toggleHeaders);
			});

		//Creating a toggle to allow the toggle of the auto Save
		new Setting(this.fileOptionsEl)
			.setName("Auto Save")
			.addToggle((toggle: ToggleComponent) => {
				this.autoSaveToggle = toggle;
				this.autoSaveValue = toggle.getValue();
				toggle
					.setValue(true)
					.onChange((value) => {
					// Setting the autosave value
					this.autoSaveValue = value;

					// Disabling/Enabling the save button
					if(this.saveButton) {
						this.saveButton.setDisabled(value);
						// this.saveButton.buttonEl.disabled = value;
						if (value && !this.saveButton.buttonEl.hasClass("element-disabled")){
							this.saveButton.buttonEl.addClass("save-button-disabled");
						} else if (!value && this.saveButton.buttonEl.hasClass("save-button-disabled")) {
							this.saveButton.buttonEl.removeClass("save-button-disabled");
						}
					}
				});
			})
			.setClass("element-disabled");

		//Creating a Save button
		new Setting(this.fileOptionsEl)
			.addButton((button: ButtonComponent) => {
				this.saveButton = button;
				button.setButtonText("Save");
				button.setDisabled(this.autoSaveToggle?.getValue()??false);
				if (button.disabled){
					button.buttonEl.addClass("element-disabled");
				}
				button.onClick((e: MouseEvent) => {
					new Notice(`Saving ${this.file.name}...`)
					this.requestSave();
				});
			})
			.setClass("element-disabled");

		const tableContainer = document.createElement("div");
		tableContainer.classList.add("csv-table-wrapper");
		this.extContentEl.appendChild(tableContainer);

		const hotContainer = document.createElement("div");
		tableContainer.appendChild(hotContainer);


		Handsontable.renderers.registerRenderer("markdown", this.markdownCellRenderer);
		Handsontable.editors.registerEditor("markdown", MarkdownCellEditor);
		this.hotSettings = {
			afterChange: this.hotChange,
			afterColumnSort: this.requestAutoSave,
			afterColumnMove: this.requestAutoSave,
			afterRowMove:   this.requestAutoSave,
			afterCreateCol: this.requestAutoSave,
			afterCreateRow: this.requestAutoSave,
			afterRemoveCol: this.requestAutoSave,
			afterRemoveRow: this.requestAutoSave,
			licenseKey: "non-commercial-and-evaluation",
			colHeaders: true,
			rowHeaders: true,
			autoColumnSize: true,
			autoRowSize: true,
			renderer: "markdown",
			editor: "markdown",
			className: "csv-table",
			contextMenu: true,
			currentRowClassName: "active-row",
			currentColClassName: "active-col",
			columnSorting: true,
			dropdownMenu: true,
			filters: true,
			manualColumnFreeze: true,
			manualColumnMove: false,  // moving columns causes too many headaches for now
			manualColumnResize: true,
			manualRowMove: false,  // moving rows causes too many headaches for now
			manualRowResize: true,
			persistentState: true,
			// preventOverflow: true,
			search: true, // TODO:290 Hijack the search ui from markdown views,
			height: "100%",
			width: "100%",
			// stretchH: 'last'
		};
		this.hot = new ExtHandsontable(hotContainer, this.hotSettings, {leaf:this.leaf});
		this.hotExport = this.hot.getPlugin("exportFile");
		this.hotState = this.hot.getPlugin("persistentState");
		this.hotFilters = this.hot.getPlugin("filters");
	}

	requestAutoSave(): void {
		if(this.autoSaveValue){
			console.warn("auto-saving");
			new Notice("Auto saving...")
			this.requestSave();
		}
	}

	hotChange(changes: Handsontable.CellChange[], source: Handsontable.ChangeSource) {
		if (source === "loadData" || this.autoSaveValue) {
			return; //don't save this change
		}
		if (this.requestAutoSave) {
			console.warn("auto-saving");
			this.requestAutoSave();
		}
	};

	// get the new file contents
	override getViewData(): string {
		// get the *source* data (i.e. unfiltered)
		const data = this.hot.getSourceDataArray();
		if (this.hotSettings.colHeaders !== true) {
			data.unshift(this.hot.getColHeader());
		}

		return Papa.unparse(data);
	};

	// Setting the view from the previously set data
	override setViewData(data: string, clear: boolean): void {
		console.log("Setting View Data");
		this.loadingBar.show();
		debounce(() => this.loadDataAsync(data)
				.then(() => {
					console.log("Loading data correctly.");
					this.loadingBar.hide();
				})
				.catch((e: any) => {
					console.error("Catch error during the loading of the data\n",e);
					this.loadingBar.hide();
					if (Array.isArray(e)){
						for (const error of e) {
							if (error.hasOwnProperty("message")){
								new Notice(error["message"]);
							} else {
								new Notice(JSON.stringify(error));
							}
						}
					} else {
						new Notice(JSON.stringify(e));
					}
					//Close the window
					this.app.workspace.activeLeaf.detach();
				})
			, 50, true).apply(this);
		return;
	};

	loadDataAsync(data: string): Promise<void> {
		console.log("loading data");
		return new Promise<void>((resolve, reject: ParseError[] | any) => {
			// for the sake of persistent settings we need to set the root element id
			this.hot.rootElement.id = this.file.path;
			this.hotSettings.colHeaders = true;

			// strip Byte Order Mark if necessary (damn you, Excel)
			if (data.charCodeAt(0) === 0xFEFF) data = data.slice(1);

			// parse the incoming data string
			Papa.parse<string[]>(data,{
				header:false,
				complete: (results: ParseResult<string[]>) => {
					//Handle the errors
					if (results.errors !== undefined && results.errors.length !== 0) {
						reject(results.errors);
						return;
					}

					this.parseResult = results;

					// load the data into the table
					this.hot.loadData(this.parseResult.data);
					// we also need to update the settings so that the persistence will work
					this.hot.updateSettings(this.hotSettings);

					// load the persistent setting for headings
					const hasHeadings = { value: false };
					this.hotState.loadValue("hasHeadings", hasHeadings);
					this.headerToggle.setValue(hasHeadings.value);

					// toggle the headers on or off based on the loaded value
					this.toggleHeaders(hasHeadings.value);
					resolve();
				}
			});
		});
	};

	override clear() {
		// clear the view content
		this.hot?.clear();
		console.log("Clear view content");
	};

	//Unloading the data
	override async onUnloadFile(file: TFile): Promise<void>{
		console.log(`Unloading ${file.name}.`);
		await super.onUnloadFile(file);
		return;
	}

	// Arrow function because "this" can bug
	toggleHeaders = (value: boolean) => {
		value = value || false; // just in case it's undefined
		// turning headers on
		if (value) {
			// we haven't specified headers yet
			if (this.hotSettings.colHeaders === true) {
				// get the data
				const data = this.hot.getSourceDataArray();
				// take the first row off the data to use as headers
				this.hotSettings.colHeaders = data.shift();
				// reload the data without this first row
				this.hot.loadData(data);
				// update the settings
				this.hot.updateSettings(this.hotSettings);
			}
		}
		// turning headers off
		else {
			// we have headers
			if (this.hotSettings.colHeaders !== true) {
				// get the data
				const data = this.hot.getSourceDataArray();
				// put the headings back in as a row
				data.unshift(this.hot.getColHeader());
				// specify true to just display alphabetical headers
				this.hotSettings.colHeaders = true;
				// reload the data with this new first row
				this.hot.loadData(data);
				// update the settings
				this.hot.updateSettings(this.hotSettings);
			}
		}

		// set this value to the state
		this.hotState.saveValue("hasHeadings", value);
	};

	// DO NOT TRANSFORM THIS INTO A REAL FUNCTION
	markdownCellRenderer = (instance: Handsontable, TD: HTMLTableCellElement, row: number, col: number, prop: string | number, value: Handsontable.CellValue, cellProperties: Handsontable.CellProperties): HTMLTableCellElement | void => {
		TD.innerHTML = "";
		MarkdownRenderer.renderMarkdown(value, TD, this.file.path || "", this || null);
		return TD;
	};

	// gets the title of the document
	getDisplayText() {
		if (this.file) return this.file.basename;
		else return "csv (no file)";
	}

	// confirms this view can accept csv extension
	canAcceptExtension(extension: string) {
		return extension == "csv";
	}

	// the view type name
	getViewType() {
		return "csv";
	}

	// icon for the view
	getIcon() {
		return "document-csv";
	}
}

class ExtHandsontable extends Handsontable {
	extContext: any;

	constructor(element: Element, options: Handsontable.GridSettings, context:any) {
		super(element, options);
		this.extContext = context;
	}
}

class MarkdownCellEditor extends Handsontable.editors.BaseEditor {
	eGui: HTMLElement;
	view: MarkdownView;

	override init(): void {
		const extContext: any = (this.hot as ExtHandsontable).extContext;
		if (extContext && extContext.leaf && !this.eGui) {
			// create the container
			this.eGui = this.hot.rootDocument.createElement("DIV");
			Handsontable.dom.addClass(this.eGui, "htMarkdownEditor");
			Handsontable.dom.addClass(this.eGui, "csv-cell-edit");

			// create a markdown (editor) view
			this.view = new MarkdownView(extContext.leaf);

			this.eGui.appendChild(this.view.contentEl);
			// hide the container
			this.eGui.style.display = "none";
			// add the container to the table root element
			this.hot.rootElement.appendChild(this.eGui);
		}
	}

	override open(event?: Event): void {
		this.refreshDimensions();
		this.eGui.show();
		this.view.editor.focus();
		this.view.editor.refresh();
	}

	refreshDimensions() {
		this.TD = this.getEditedCell();

		// TD is outside of the viewport.
		if (!this.TD) {
			this.close();

			return;
		}
		//@ts-ignore - this.hot.view not recognized.
		const { wtOverlays } = this.hot.view.wt;
		const currentOffset = Handsontable.dom.offset(this.TD);
		const containerOffset = Handsontable.dom.offset(this.hot.rootElement);
		const scrollableContainer = wtOverlays.scrollableElement;
		const editorSection = this.checkEditorSection();
		let width = Handsontable.dom.outerWidth(this.TD) + 1;
		let height = Handsontable.dom.outerHeight(this.TD) + 1;

		let editTop = currentOffset.top - containerOffset.top - 1 - (scrollableContainer.scrollTop || 0);
		let editLeft = currentOffset.left - containerOffset.left - 1 - (scrollableContainer.scrollLeft || 0);

		let cssTransformOffset;

		switch (editorSection) {
		case "top":
			cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.topOverlay.clone.wtTable.holder.parentNode);
			break;
		case "left":
			cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.leftOverlay.clone.wtTable.holder.parentNode);
			break;
		case "top-left-corner":
			cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.topLeftCornerOverlay.clone.wtTable.holder.parentNode);
			break;
		case "bottom-left-corner":
			cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.bottomLeftCornerOverlay.clone.wtTable.holder.parentNode);
			break;
		case "bottom":
			cssTransformOffset = Handsontable.dom.getCssTransform(wtOverlays.bottomOverlay.clone.wtTable.holder.parentNode);
			break;
		default:
			break;
		}

		if (this.hot.getSelectedLast()[0] === 0) {
			editTop += 1;
		}
		if (this.hot.getSelectedLast()[1] === 0) {
			editLeft += 1;
		}

		const selectStyle = this.eGui.style;

		if (cssTransformOffset && cssTransformOffset !== -1) {
			//@ts-ignore
			selectStyle[cssTransformOffset[0]] = cssTransformOffset[1];
		} else {
			Handsontable.dom.resetCssTransform(this.eGui);
		}

		const cellComputedStyle = Handsontable.dom.getComputedStyle(this.TD, this.hot.rootWindow);
		if (parseInt(cellComputedStyle.borderTopWidth, 10) > 0) {
			height -= 1;
		}
		if (parseInt(cellComputedStyle.borderLeftWidth, 10) > 0) {
			width -= 1;
		}

		selectStyle.height = `${height}px`;
		selectStyle.minWidth = `${width}px`;
		selectStyle.maxWidth = `${width}px`;
		selectStyle.top = `${editTop}px`;
		selectStyle.left = `${editLeft}px`;
		selectStyle.margin = "0px";
	}

	override getEditedCell(): HTMLTableCellElement | null {
		//@ts-ignore - this.hot.view not recognized.
		const { wtOverlays } = this.hot.view.wt;
		const editorSection = this.checkEditorSection();
		let editedCell;

		switch (editorSection) {
		case "top":
			editedCell = wtOverlays.topOverlay.clone.wtTable.getCell({
				row: this.row,
				col: this.col
			});
			this.eGui.style.zIndex = "101";
			break;
		case "top-left-corner":
		case "bottom-left-corner":
			editedCell = wtOverlays.topLeftCornerOverlay.clone.wtTable.getCell({
				row: this.row,
				col: this.col
			});
			this.eGui.style.zIndex = "103";
			break;
		case "left":
			editedCell = wtOverlays.leftOverlay.clone.wtTable.getCell({
				row: this.row,
				col: this.col
			});
			this.eGui.style.zIndex = "102";
			break;
		default:
			editedCell = this.hot.getCell(this.row, this.col);
			this.eGui.style.zIndex = "";
			break;
		}

		return editedCell < 0 ? void 0 : editedCell;
	}

	override close(): void {
		this.eGui.hide();
	}
	override focus(): void {
		this.view.editor.focus();
		this.view.editor.refresh();
	}
	override getValue() {
		return this.view.currentMode.get();
	}
	override setValue(newValue?: any): void {
		if(this)
			this.view.currentMode.set(newValue, false);
	}
}

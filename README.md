# CSV Editor Obsidian Plugin
[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/Sayama3/csv-obsidian?style=for-the-badge&sort=semver)](https://github.com/Sayama3/csv-obsidian/releases/latest)
![GitHub All Releases](https://img.shields.io/github/downloads/Sayama3/csv-obsidian/total?style=for-the-badge)

A plugin for [Obsidian](https://obsidian.md) which allows viewing and editing of CSV files in a spreadsheet-like table format.

**Back up your CSV files!** This plugin is very new and therefore experimental. At this stage, data loss is a very real possibility!

![Screenshot](https://github.com/Sayama3/csv-obsidian/raw/main/screenshot.png)

### Original Repo

Thanks to [deathau](https://github.com/deathau) for the [original repo](https://github.com/deathau/csv-obsidian).

### Features
- Open (and edit) CSV files right from Obsidian!
- Auto-saving
- Per-file setting for including headers (persisted in local storage)
- Markdown editing, a preview for each individual cell (internal links aren't working correctly, yet)
- Sort the data by clicking on a column name
- Filter by column values
- Freeze columns
- Insert new columns/rows

## Installation

### From GitHub
- Download the latest main
- Extract the files from the zip to your vault's plugins folder: `<vault>/.obsidian/plugins/csv-obsidian`  
  Note: On some machines the `.obsidian` folder may be hidden. On MacOS you should be able to press `Command+Shift+Dot` to show the folder in Finder.
- Reload Obsidian
- If prompted about Safe Mode, you can disable safe mode and enable the plugin.
  Otherwise head to Settings, third-party plugins, make sure safe mode is off and
  enable the plugin from there.

## Development

This project uses Typescript to provide type checking and documentation.  
The repo depends on the latest [plugin API](https://github.com/obsidianmd/obsidian-api) in Typescript Definition format, which contains TSDoc comments describing what it does.

**Note:** The Obsidian API is still in early alpha and is subject to change at any time!

If you want to contribute to development and/or just customize it with your own
tweaks, you can do the following:
- Clone this repo.
- `npm i` or `yarn` to install dependencies
- `npm run build` to compile.
- Copy `manifest.json`, `main.js` and `styles.css` to a subfolder of your plugins
  folder (e.g, `<vault>/.obsidian/plugins/<plugin-name>/`)
- Reload obsidian to see changes

Alternately, you can clone the repo directly into your plugins folder and once
dependencies are installed use `npm run dev` to start compilation in watch mode.  
You may have to reload obsidian (`ctrl+R`) to see changes.

# Version History
## 0.0.1
Initial release of csv-obsidian! See [Features](#Features) above
## 0.0.2
Update of the source code and the package.json to use the latest version the api and each package.
Add a button to create CSV from `File explorer` tab.
## 0.0.3
Fix the error that was overriding the faulty csv. *(They are aside, the editor will just close)*.
A notice will also show what went wrong with the csv.

### Known issue
Sometimes, the headers won't move, when scrolling so the content will not entirely be displayed. 
Try reloading/restart obsidian or switching to a regular file back and forth. 

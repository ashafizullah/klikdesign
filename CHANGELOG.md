# Changelog

## 0.1.5

- The Linux AppImage, .deb and .rpm now run on older distributions (glibc 2.35 and newer, e.g. Ubuntu 22.04), not only on the newest ones

## 0.1.4

- Group and ungroup elements (Cmd+G / Shift+Cmd+G); groups move, align, copy and duplicate as one and show in Layers under a renamable header
- Crop images on the canvas: double-click a photo, then drag and zoom it inside its frame. The crop is kept in every export
- Distribute the selection with equal gaps, a right-click menu on the canvas and layer rows, and Shift-click to select a range of layers
- Cmd+V pastes the last thing copied, here or in another app: screenshots, copied images, image files or text
- Version history (clock button in the top bar): snapshots are saved on open, before AI edits, every 10 minutes of editing and by hand, and can be previewed and restored
- Icons: the Lucide set (~2,000) in a new Elements tab, with editable color and line thickness
- QR codes for a link, a WhatsApp chat or text, drawn as vectors so they stay sharp in every export
- Photo frames (circle, arch, triangle, star, hexagon, heart, blob) and photo adjustments (brightness, contrast, saturation, black and white, color overlay)
- The AI and Claude Code can group, crop, add icons and QR codes, and frame and adjust photos
- Settings → Open-source licenses shows the license of every bundled package

## 0.1.3

- New Darkroom look, matching KlikReel: warm charcoal surfaces, tungsten-amber accents and new typography (Fraunces, IBM Plex Sans and IBM Plex Mono, bundled so they work offline)
- Multi-page designs (carousels): a page strip under the canvas adds, duplicates, reorders and deletes pages. PDF export includes every page; PNG, JPG and SVG export one numbered file per page
- Brand kit per workspace: colors, fonts, logos and a note on voice, editable from the workspace header or the editor's Brand tab. The AI can fill it by reading the project folder, and follows it when designing
- Magic resize: fit a design to another format, as a copy or in place
- Fonts from curated Google Fonts or any font installed on your computer, in a searchable picker, plus a text toolbar above the canvas
- Layers show a preview of each element and can be reordered by dragging
- Images live with the design: the Uploads tab lists them, and image files can be dropped onto the canvas
- AI settings can load the model list from the API and set a reasoning effort per profile; chat replies render Markdown
- More tools for the AI and Claude Code: pages, resize, brand kit, design images and installed fonts

## 0.1.2

- Built-in terminal (Ctrl+` or the terminal button in the top bar), opened in the design's project folder
- Works with Claude Code: turn on the local MCP server (terminal → Connect Claude Code), add it to your own Claude Code once, and ask Claude to lay out and edit designs, place images, look at the result and export PNG, JPG, PDF or SVG. Changes show up live and can be undone, and a green badge shows when Claude Code is connected
- Without an API key, the AI chat now tells you right away how to add one or use Claude Code instead

## 0.1.1

- Workspaces like KlikReel: add a project folder first, then create designs inside it. Every design in a workspace is linked to its folder, so the AI always researches that codebase (copy, brand colors, logo, screenshots)
- Home shows workspaces in a sidebar with each one's designs, plus right-click menus to open, rename, reveal in Finder or unlink
- New design dialog with sizes and templates
- The editor shows which project folder the AI reads
- Check for updates from the home screen

## 0.1.0

First public release.

- Prompt → poster: the AI designs a full layout from a short brief, in the size you pick
- Link a project folder: the AI researches the codebase (copy, brand colors, logo, screenshots) and designs an on-brand poster
- Revise by chat, with every AI request as one undo step; vision models review their own result
- Canvas editor with snapping, multi-select, inline text editing, layers, align and arrange
- Text with 20 Google Fonts, shapes, images, gradients, outlines and shadows
- Four starter templates and common poster and social sizes
- Export to PNG, JPG, PDF and SVG
- Designs auto-save to a local library with thumbnails
- Checks for updates once a day and installs them in-app
- English and Bahasa Indonesia

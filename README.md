# Notes and Projects

## Start the site

Run the following command from the project directory to start the site and the feedback endpoint.

```sh
python3 serve.py
```

aKeep the terminal running and open the homepage in your browser. The server listens on this computer only. After saving a content edit, refresh the page to see it. Press `Control+C` in the terminal to stop the server. [Local homepage](http://127.0.0.1:4321/)

## Add a note or project

1. Write your draft in Obsidian or another editor. Collect any images, video files, and project links you want to include.
2. Add a page to `dist/entries/`. Use `dist/entries/simple-api.html` as a template for a note or `dist/entries/http-trace.html` for a project with an image. Use a lowercase filename such as `my-first-note.html`, with hyphens between words. Update the browser title, the visible title, and the content inside `detail-body`. Replace the sample label if you use one. Store local media in `dist/media/` and refer to it from the entry page with paths like `../media/my-project.png`.
3. Add a card to the `catalog-grid` list in `dist/index.html`. Point it to the new page, use either a text title or a cover image with the title as its `alt` text, and set the date in both formats, for example `datetime="2026-11-13"` and `11.13.2026`. Put the card at the top of the list if you want it to appear first. The feedback page reads its entry choices from this list.
4. Refresh the homepage, open the new card, and check the content, links, and media. Then open **Report an Issue** and search for the new entry by title.

You can give Codex the draft and media files and ask it to do steps 2–4. For example, “Add this Markdown draft as a new note. Use a text-only card and put it first on the homepage. Keep my wording. Check the detail page and make sure the note appears in the feedback list.” The site stores published entries as HTML, so an Obsidian draft needs to be converted when it is added to the site.

## Submit and read feedback

Open **Report an Issue** at the bottom of the homepage. Select the entry, write the details in Markdown, and use the book icon to check how the text renders. The preview shows link and image addresses as plain text. Use the image icon to attach a screenshot, then choose **Annotate** to mark it up. Click **Submit Report** and look for **Report saved.**

On Mac, `⌘Z` undoes typing in the source editor. Toolbar formatting such as **Bold** is currently outside the text undo history.

Reports submitted through **Report an Issue** are saved to `feedback.jsonl` in the project root. Each report stores the original Markdown and the names and paths of attached images. Images are saved in `feedback-images/`, including any annotations. Reports created before general file uploads were removed may reference older files in `feedback-files/`.

Open `feedback.jsonl` in an editor to review submitted reports. New reports are appended at the bottom. Keep a separate copy of the file and its attachment folders if you want to back up feedback. Git ignores all three paths.

## Edit the site

`dist/index.html` also contains the bio and social links that open when you click **YANG SHUO**. The variables at the top of `dist/style.css` control the light and dark palettes, page margins, reading width, and fonts.

The homepage uses sample content and images. Replace them with your own before publishing `dist/` as a static site. Deploy the `/api/feedback` endpoint to receive reports online.

The theme toggle uses images rendered from Earth and Moon surface textures. [NASA Earth Observatory Earth texture](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/) · [NASA Scientific Visualization Studio Moon texture](https://svs.gsfc.nasa.gov/4720/)

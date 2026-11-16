# SC Points Analysis

A small static website built with plain HTML, CSS and JavaScript, hosted on GitHub Pages.

## Structure

```
index.html      Main page
css/style.css   Styles
js/main.js      Scripts
assets/         Images and other static files
```

## Run locally

No build step is needed. Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Deploy

In the GitHub repository go to **Settings → Pages**, set the source to
**Deploy from a branch**, branch `main`, folder `/ (root)`.

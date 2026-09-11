# Contiinex presentation

Fifteen-slide, hospital-facing presentation that ALPS advisors bring to hospital leadership, with official Contiinex branding, a compounding-risk chart and a revenue-cycle ring that build one stage per page turn, an interactive operating-margin calculator with a margin bridge, a pricing page with a consumption calculator that mirrors the Contiinex financial model and follows the entered revenue, a dismissable first-person pitch track that a customer can read or an advisor can read aloud, source notes per slide, and keyboard, swipe and footer navigation.

## GitHub Pages

The `docs` folder contains the complete static website. In repository Settings → Pages, select Deploy from a branch, choose `main`, and select `/docs`. All asset paths are relative and support a project repository URL.

## Edit and rebuild

Run `npm ci` then `npm run build:pages`. Replace `docs` with the resulting `dist-pages` folder before committing.

The site requires no server, Sites hosting, authentication service or external font requests.

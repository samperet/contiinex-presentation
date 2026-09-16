# Contiinex presentation

Fourteen-slide, hospital-facing presentation that ALPS advisors bring to hospital leadership, with official Contiinex branding, a compounding-risk chart that builds one stage per page turn and pairs each risk with the Contiinex intervention, an interactive operating-margin calculator with a margin bridge, a pricing page with a consumption calculator that mirrors the Contiinex pricing workbook (back-office AI per transaction, voice AI per minute) and follows the entered revenue, a dismissable first-person pitch track that a customer can read or an advisor can read aloud, source notes per slide, and keyboard, swipe and footer navigation.

## GitHub Pages

The `docs` folder contains the complete static website: `index.html` is the deck and `pricing.html` is the standalone pricing page (cost flow, EBIDA bridge and adjustable assumptions from the ALPS pricing tab). In repository Settings → Pages, select Deploy from a branch, choose `main`, and select `/docs`. All asset paths are relative and support a project repository URL.

## Edit and rebuild

Run `npm ci` then `npm run build:pages`. Replace `docs` with the resulting `dist-pages` folder before committing.

The site requires no server, Sites hosting, authentication service or external font requests.

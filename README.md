# Contiinex presentation

Fourteen-slide, hospital-facing presentation that ALPS advisors bring to hospital leadership, with official Contiinex branding, a compounding-risk chart that builds one stage per page turn and pairs each risk with the Contiinex intervention, an interactive operating-margin calculator with a margin bridge, a pricing slide whose return summary follows the entered revenue, an ROI calculator across all twelve modules with fine-tuning one question per screen, a dismissable first-person pitch track that a customer can read or an advisor can read aloud, source notes per slide, and keyboard, swipe and footer navigation.

## GitHub Pages

The `docs` folder contains the complete static website: `index.html` is the deck and `pricing.html` is the ROI calculator: it opens on typical values for all twelve revenue-cycle modules, each of which can be switched on or off or fine-tuned one question per screen, with the EBITDA added, return, a cumulative net benefit chart over three years, a Sankey of where the money goes, every calculation step, a shareable link and Save PDF. In repository Settings → Pages, select Deploy from a branch, choose `main`, and select `/docs`. All asset paths are relative and support a project repository URL.

## Edit and rebuild

Run `npm ci` then `npm run build:pages`. Replace `docs` with the resulting `dist-pages` folder before committing.

The ROI model is in `app/roi/model.ts`, ported unchanged from the calculator at contiinex.com/resources/roi-calculator; `npm test` checks it against that calculator's figures. `app/roi/portfolio.ts` combines the modules, scales overlapping denial shares and builds the 36-month timeline. Per-process defaults and labels are in `BASE_SOLUTIONS` and `GLOBAL_FIELDS`.

The site requires no server, Sites hosting, authentication service or external font requests.

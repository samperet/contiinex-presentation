# Contiinex presentation

Fourteen-slide, hospital-facing presentation that ALPS advisors bring to hospital leadership, with official Contiinex branding, a compounding-risk chart that builds one stage per page turn and pairs each risk with the Contiinex intervention, an interactive operating-margin calculator with a margin bridge, a pricing slide whose return summary follows the entered revenue, an ROI calculator that opens as an executive report on typical values sized to the hospital's revenue, with the full model and fine-tuning one question per screen behind Edit inputs, header tabs between the presentation and the calculator, a dismissable first-person pitch track that a customer can read or an advisor can read aloud, source notes per slide, and keyboard, swipe and footer navigation.

## GitHub Pages

The `docs` folder contains the complete static website: `index.html` is the deck and `pricing.html` is the ROI calculator as an executive report: one estimated EBITDA figure at full run-rate, three lines that add up to it, short timing, scale and downside lines, then the cumulative net benefit chart, where the figure comes from and what it rests on. "Edit inputs" opens the advisor controls (modules, hospital-wide values, one-question-per-screen fine-tuning). Save PDF prints a 2-page report; Copy link shares the exact estimate.

## Edit and rebuild

Run `npm ci` then `npm run build:pages`. Replace `docs` with the resulting `dist-pages` folder before committing.

The ROI model is in `app/roi/model.ts`, ported unchanged from the calculator at contiinex.com/resources/roi-calculator; `npm test` checks it against that calculator's figures. `app/roi/portfolio.ts` combines the modules (nine by default; Scheduling, Referral and Credentialing off), counts the shared denial pool once in sequence, sizes typical volumes and staff to the hospital's revenue and builds the 36-month timeline. `app/roi/format.ts` holds the one money format used by the report, the PDF and the deck slide. Per-process defaults and labels are in `BASE_SOLUTIONS` and `GLOBAL_FIELDS`.

The site requires no server, Sites hosting, authentication service or external font requests.

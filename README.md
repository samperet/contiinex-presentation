# Contiinex presentation

Eight-slide presentation, with official Contiinex branding, claim-journey charts that build one stage per page turn, and keyboard navigation. The ownership-slide footnote and its marker have been removed.

## GitHub Pages

The `docs` folder contains the complete static website. In repository Settings → Pages, select Deploy from a branch, choose `main`, and select `/docs`. All asset paths are relative and support a project repository URL.

## Edit and rebuild

Run `npm ci` then `npm run build:pages`. Replace `docs` with the resulting `dist-pages` folder before committing.

The site requires no server, Sites hosting, authentication service or external font requests.

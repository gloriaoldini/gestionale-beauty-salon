# Beauty salon manager · prototype (concept)

Clickable prototype of a management tool for a beauty salon: calendar, clients, treatments, products, gift vouchers and a takings dashboard.
UX/UI concept by Gloria Oldini. Names, prices and data are fictional.

## Try it

- `index.html`: start page with the two paths
- `Login.html`: **demo**, the salon in use with sample data (press *Sign in*)
- `Signup.html`: **first sign-in**, create the account, then the welcome tour and an empty salon

Anything you enter is stored only in your browser. *Sign in* restores the sample data.

## Structure

- `src/*.dc.html`: the screens (template + logic)
- `dc.js`: a small runtime that reads the templates and updates the page
- `gb.css`: design system (colours, type, components)
- `vendor/morphdom-umd.min.js`: [morphdom](https://github.com/patrick-steele-idem/morphdom) library (MIT licence, see `vendor/morphdom-LICENSE.txt`)

# Expense Tracker Visualizer

A **Personal Finance Visualizer** web app: enter your monthly income and expenses and see a live breakdown with a pie chart that updates as you type.

## Features

- **Monthly income** — single input for total income
- **Expenses** — add multiple categories (e.g. Rent, Food, Transport) with names and amounts
- **Real-time pie chart** — built with [Chart.js](https://www.chartjs.org/), updates as you type
- **Summary** — income, total expenses, and remaining amount
- No backend: everything runs in the browser; no data is stored

## How to run

1. Open the project folder: `expense-tracker-visualizer`
2. Serve the files with any static server, or open `index.html` in a browser.

**Using a local server (recommended):**

```bash
# Python 3
python -m http.server 8000

# Node (npx)
npx serve .
```

Then open `http://localhost:8000` in your browser.

## Tech

- HTML, CSS, JavaScript (vanilla)
- [Chart.js](https://www.chartjs.org/) (CDN) for the pie chart

## License

MIT

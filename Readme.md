# forkcast

AI-powered meal planning web app, Generate a personalised multi-day meal plan, browse full recipes sourced from real cooking sites, track what's in your pantry, and turn the plan into a shopping checklist with one-click search links to Blinkit, BigBasket and Instamart.

## Features

- **AI meal planning**: generate 1-7 days of meals starting on any date, with full recipe details (ingredients, steps, macros, source links)
- **Two recipe modes**
  - **Web Search**: plans recipes with Gemini, finds the real recipe on a cooking site through Tavily, then writes the final recipe from that real content
  - **AI Generated**: skips the web and has Gemini write each recipe from its own training knowledge. Faster, but not sourced from a real page
- **Preferences**: cuisines, vegetarian / vegan, allergens, sodium / sugar / macro targets, prep and cook time limits, equipment, and meals per day. Vegetarian is on by default
- **Leftovers**: tell forkcast what's in your fridge and it works those ingredients into the plan
- **Selective regeneration**: swap out individual meals without regenerating the whole plan
- **Favorites and pinning**: star recipes to save them, and pin favorites so they appear in your next plan
- **Recent recipes**: avoids repeating recent meals
- **Pantry**: log what you already have. Pantry items are skipped when the shopping list is built
- **Shopping list**: a combined ingredient checklist with quantity estimates. Each item has a search link for Blinkit, BigBasket or Instamart (you pick the retailer), a "Copy list" button, and a checked state that persists between visits
- **Dark and light mode**

forkcast does not scrape retailers and does not use any cart API. The links just open the retailer's own search page for the item, in your own browser session.

## Tech stack

| Layer         | Tech                                                  |
| ------------- | ----------------------------------------------------- |
| Frontend      | React 19, TypeScript, Vite, Zustand                   |
| Backend       | Node.js, Express, TypeScript (ESM)                    |
| AI            | Google Gemini (`@google/genai`), free tier compatible |
| Recipe search | Tavily (`@tavily/core`)                               |
| Grocery       | Retailer search links (Blinkit, BigBasket, Instamart) |

## How it works

### Recipe generation

Both pipelines stream progress to the browser over Server-Sent Events (SSE), so the UI can show messages like "Writing your meal plan... (2/7)".

**Web Search**

1. **Plan.** Gemini decides which recipes fit your preferences and picks a source site for each (for Indian dishes it prefers sites such as vegrecipesofindia.com and hebbarskitchen.com).
2. **Retrieve.** The backend searches for each recipe with Tavily, restricted to that site, and extracts the real ingredient list and steps. It prefers the page's embedded Schema.org Recipe data (JSON-LD) and falls back to Tavily's content extraction.
3. **Write.** Gemini produces the final structured recipe (macros, steps, ingredients) from the retrieved content, one day at a time, so it can't contradict the real recipe.

**AI Generated**: one Gemini call per day, written entirely from the model's own knowledge. These recipes carry no source link.

Both modes apply to full-plan generation and to regenerating individual meals.

### Reliability

- Gemini calls retry on rate limits (HTTP 429) and overloads (HTTP 503) with increasing waits
- After a 503, the retry switches to a lighter fallback model
- Days are generated sequentially to stay within free-tier rate limits
- Model output is parsed as JSON, and malformed or empty responses fail immediately instead of retrying

### Shopping list

The list is built in the browser from the generated plan:

1. Ingredients from every recipe are merged under a canonical key (plural / singular variants and hyphenation collapse into one row)
2. Anything in your pantry is moved to its own section instead of the to-buy list
3. Each item carries a `searchTerm` written the way a shopper would type it into an Indian grocery app (for example `paneer`, `atta`, `curd`, `toor dal`)
4. You tick items off as you buy them, and the checked state is saved locally

### Access limits

The generation endpoints are rate limited per IP to protect the AI quota. In production the limit is 2 requests per day, and a shared access code (`FULL_ACCESS_CODE`) raises it to 10 for trusted users. In development the limit is effectively off.

## Project structure

```
forkcast/
  package.json            npm workspace root
  frontend/               React + Vite app
    src/
      components/         UI (meal plan, modals, shared UI)
      stores/             Zustand stores (preferences, meal plan, pantry, usage)
      services/           API client and SSE streaming
      utils/              date, ingredient and export helpers
  backend/                Express API
    src/
      index.ts            server, rate limiting, image proxy
      routes/             meal plan (streaming) and access routes
      services/           aiService (Gemini) and tavilyService (Tavily)
```

## Local development

### Prerequisites

- Node.js 22+
- A [Google AI Studio](https://aistudio.google.com) API key (free tier is enough)
- A [Tavily](https://tavily.com) API key (only needed for Web Search mode)

### Setup

```bash
git clone https://github.com/dropps07/forkcast.git
cd forkcast
npm install
```

Create the backend environment file and add your keys:

```bash
cp backend/.env.example backend/.env
```

```env
GEMINI_API_KEY=your-gemini-key
TAVILY_API_KEY=your-tavily-key
PORT=3001
```

Never commit `backend/.env`. It is gitignored, and `.env.example` should only ever hold placeholders.

Start the backend and frontend in two terminals:

```bash
npm run dev -w backend
npm run dev -w frontend
```

The app runs at `http://localhost:5173`. The Vite dev server proxies `/api` to the Express backend on port 3001. To check the backend on its own:

```bash
curl http://localhost:3001/health
```

### Build

```bash
npm run build -w backend     # compiles to backend/dist
npm run build -w frontend    # builds to frontend/dist
npm run start -w backend     # runs the compiled backend
```

In production, the backend serves the built frontend from `frontend/dist`, so one server hosts the whole app.

## Environment variables

| Variable                | Required   | Default                 | Description                                                                                            |
| ----------------------- | ---------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`        | Yes        | none                    | Google Gemini API key                                                                                  |
| `TAVILY_API_KEY`        | Yes        | none                    | Tavily search and extract API key                                                                      |
| `GEMINI_MODEL`          | No         | set in `aiService.ts`   | Main Gemini model                                                                                      |
| `GEMINI_FALLBACK_MODEL` | No         | set in `aiService.ts`   | Lighter model used after a 503                                                                         |
| `GEMINI_RETRY_MS`       | No         | `10000`                 | Base wait between retries (attempt n waits n x this)                                                   |
| `PORT`                  | No         | `3001`                  | Backend port                                                                                           |
| `CORS_ORIGIN`           | No         | `http://localhost:5173` | Allowed CORS origin in development                                                                     |
| `NODE_ENV`              | No         | none                    | Set to `production` to enable the strict rate limit                                                    |
| `FULL_ACCESS_CODE`      | No         | none                    | Shared passphrase; visiting `/<code>` or `?access=<code>` raises the daily limit to 10                 |
| `COOKIE_SIGNING_SECRET` | No         | none                    | Signs the access cookie; generate with `openssl rand -hex 32`. Required for `FULL_ACCESS_CODE` to work |
| `APP_URL`               | Production | none                    | Public URL of the deployed app (marks the access cookie as secure)                                     |

## Roadmap

- Frontend redesign
- Free-tier deployment (single Node service serving both API and frontend)
- Faster generation (parallel days, shorter model "thinking")
- Validation of model output with a schema

## Acknowledgements

The overall structure of the app (type-first state design, two generation pipelines, access gate) was inspired by [SempAI](https://github.com/kylemtan/SempAI). forkcast replaces its Claude and Kroger integrations with Gemini and Indian grocery search links.

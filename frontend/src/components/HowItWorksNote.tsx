// Visible "How it Works?" note for the landing (empty) view. Same
// pipeline the Help modal documents, but on the page itself instead of
// behind a button. Every claim below is the real implementation:
// the web pipeline plans with Gemini, retrieves real recipes with
// Tavily (Schema.org JSON-LD), writes from that retrieved content,
// validates each reply with Zod, and fails over down the model chain.
// No embeddings, vector search or fine-tuning anywhere in this app,
// so none is claimed here.
const STEPS = [
  {
    title: '1. Your brief',
    body: 'You set cuisines, diet, allergies, macros, time limits and pantry leftovers. The plan is built around these numbers.',
  },
  {
    title: '2. Planning',
    body: 'An LLM plans the week. It picks a recipe for each slot, checks it against your macro budgets, allergen traps and time limits, and names the best source site for each recipe. The plan comes back as structured JSON and is validated before anything continues.',
  },
  {
    title: '3. Retrieval',
    body: 'Tavily searches the web for each recipe on its source site. It pulls the real ingredients, steps and nutrition from the page Schema.org recipe data. The model writes from retrieved facts, not from memory. That is RAG, retrieval-augmented generation.',
  },
  {
    title: '4. Writing',
    body: 'Gemini writes each day from the retrieved content only. It must not contradict a real published recipe. Three days are written in parallel. Each day streams to your screen over SSE as soon as it is done.',
  },
  {
    title: '5. Validation',
    body: 'Every reply is parsed as JSON and checked against a strict schema before it reaches the screen. A reply that fails validation moves to the next model instead of shipping a broken recipe.',
  },
  {
    title: '6. Failover',
    body: 'If a model is overloaded, rate limited or out of its daily quota, the request moves to the next model automatically. Gemini first, then Groq gpt-oss-20b as the final backup. A daily quota failure never wastes a retry on the same exhausted model.',
  },
];

export default function HowItWorksNote() {
  return (
    <section className="how-it-works-note" aria-label="How Forkcast works">
      <h3 className="how-it-works-note__title">How it Works?</h3>
      <p className="how-it-works-note__intro">
        More than a prompt to a chatbot. Every plan runs through a pipeline that plans, retrieves and validates before anything reaches your screen.
      </p>
      <div className="how-it-works__cards">
        {STEPS.map((s) => (
          <div key={s.title} className="how-it-works__card">
            <div className="how-it-works__card-title">{s.title}</div>
            <p className="how-it-works__card-body">{s.body}</p>
          </div>
        ))}
      </div>
      <p className="how-it-works-note__footer">
        Free tier: 5 plans a day (10 with Full Access). In Web Search mode, every recipe links to the real page it came from.
      </p>
    </section>
  );
}

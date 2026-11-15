// Curated sample meal plan for Demo Mode — a ready-made 3-day plan visitors
// can browse without an API key or using the generation quota. The dates are
// the next 3 days from today, computed at load time so they are always
// current. Recipes are complete Recipe objects (matching RecipeSchema) with
// realistic ingredients and macros; they are samples, not AI output, so
// aiGenerated is false and sourceUrl/imageUrl are null.
import type { DayPlan, Recipe } from '../types/mealPlan';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function nextDays(count: number): { day: string; date: string }[] {
  const out: { day: string; date: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push({ day: DAY_NAMES[d.getDay()] ?? 'Monday', date: `${y}-${m}-${day}` });
  }
  return out;
}

type RecipeCore = Omit<Recipe, 'sourceUrl' | 'imageUrl' | 'aiGenerated'>;

function sampleRecipe(core: RecipeCore): Recipe {
  return { ...core, sourceUrl: null, imageUrl: null, aiGenerated: false };
}

const poha = sampleRecipe({
  id: 'poha',
  name: 'Poha',
  cuisine: 'West Indian',
  prepTime: 10,
  cookTime: 15,
  servings: 2,
  macros: { calories: 320, carbohydrates: 55, protein: 7, fats: 8, fiber: 4, sodium: 600, sugar: 3 },
  dietaryTags: ['vegetarian'],
  equipment: ['stove', 'pan'],
  ingredients: [
    { name: 'flattened rice (poha)', quantity: 2, unit: 'cup', searchTerm: 'poha' },
    { name: 'onion', quantity: 1, unit: '', searchTerm: 'onion' },
    { name: 'green chilli', quantity: 2, unit: '', searchTerm: 'green chilli' },
    { name: 'peanuts', quantity: 2, unit: 'tbsp', searchTerm: 'peanuts' },
    { name: 'turmeric powder', quantity: 0.5, unit: 'tsp', searchTerm: 'turmeric' },
    { name: 'mustard seeds', quantity: 1, unit: 'tsp', searchTerm: 'mustard seeds' },
    { name: 'curry leaves', quantity: 8, unit: '', searchTerm: 'curry leaves' },
    { name: 'lemon', quantity: 1, unit: '', searchTerm: 'lemon' },
  ],
  steps: [
    'Rinse the poha in a colander until soft, then drain and set aside for 5 minutes.',
    'Heat oil in a pan, add mustard seeds and curry leaves, and let them splutter.',
    'Add the chopped onion and green chillies and sauté until the onion softens.',
    'Stir in the turmeric, peanuts and softened poha, and toss gently for 2 minutes.',
    'Squeeze lemon over the top and serve hot.',
  ],
  notes: 'Do not soak the poha — a quick rinse is enough or it turns mushy.',
  sourceSite: 'vegrecipesofindia.com',
});

const dalTadkaJeeraRice = sampleRecipe({
  id: 'dal-tadka-with-jeera-rice',
  name: 'Dal Tadka with Jeera Rice',
  cuisine: 'North Indian',
  prepTime: 15,
  cookTime: 30,
  servings: 2,
  macros: { calories: 480, carbohydrates: 70, protein: 18, fats: 12, fiber: 10, sodium: 700, sugar: 4 },
  dietaryTags: ['vegetarian'],
  equipment: ['stove', 'pressure cooker', 'pan'],
  ingredients: [
    { name: 'toor dal', quantity: 1, unit: 'cup', searchTerm: 'toor dal' },
    { name: 'basmati rice', quantity: 1, unit: 'cup', searchTerm: 'basmati rice' },
    { name: 'cumin seeds', quantity: 1, unit: 'tsp', searchTerm: 'cumin seeds' },
    { name: 'ghee', quantity: 1, unit: 'tbsp', searchTerm: 'ghee' },
    { name: 'garlic', quantity: 4, unit: 'cloves', searchTerm: 'garlic' },
    { name: 'tomato', quantity: 1, unit: '', searchTerm: 'tomato' },
    { name: 'turmeric powder', quantity: 0.5, unit: 'tsp', searchTerm: 'turmeric' },
    { name: 'red chilli powder', quantity: 0.5, unit: 'tsp', searchTerm: 'red chilli powder' },
  ],
  steps: [
    'Pressure cook the toor dal with turmeric until soft, then whisk it smooth.',
    'Cook the basmati rice separately and keep warm.',
    'Heat ghee in a pan, add cumin seeds and garlic, and fry until golden.',
    'Add the tomato and red chilli powder, cook for 2 minutes, then pour in the dal.',
    'Temper the rice with cumin seeds in ghee and serve with the dal.',
  ],
  notes: 'A squeeze of lemon in the dal lifts the flavour.',
  sourceSite: 'vegrecipesofindia.com',
});

const paneerButterMasalaNaan = sampleRecipe({
  id: 'paneer-butter-masala-with-naan',
  name: 'Paneer Butter Masala with Naan',
  cuisine: 'North Indian',
  prepTime: 15,
  cookTime: 25,
  servings: 2,
  macros: { calories: 520, carbohydrates: 45, protein: 22, fats: 28, fiber: 5, sodium: 800, sugar: 8 },
  dietaryTags: ['vegetarian'],
  equipment: ['stove', 'pan', 'tawa'],
  ingredients: [
    { name: 'paneer', quantity: 200, unit: 'g', searchTerm: 'paneer' },
    { name: 'tomato', quantity: 3, unit: '', searchTerm: 'tomato' },
    { name: 'onion', quantity: 1, unit: '', searchTerm: 'onion' },
    { name: 'butter', quantity: 2, unit: 'tbsp', searchTerm: 'butter' },
    { name: 'cream', quantity: 0.25, unit: 'cup', searchTerm: 'cream' },
    { name: 'garam masala', quantity: 1, unit: 'tsp', searchTerm: 'garam masala' },
    { name: 'kasuri methi', quantity: 1, unit: 'tsp', searchTerm: 'kasuri methi' },
    { name: 'naan', quantity: 2, unit: '', searchTerm: 'naan' },
  ],
  steps: [
    'Sauté the onion and tomatoes in butter until soft, then blend into a smooth puree.',
    'Return the puree to the pan, add garam masala, and simmer for 5 minutes.',
    'Stir in the cream and kasuri methi, then add the paneer cubes.',
    'Cook gently for 3 minutes so the paneer stays soft.',
    'Warm the naan on a tawa and serve with the masala.',
  ],
  notes: 'Do not boil after adding the cream or it can split.',
  sourceSite: 'hebbarskitchen.com',
});

const alooParathaCurd = sampleRecipe({
  id: 'aloo-paratha-with-curd',
  name: 'Aloo Paratha with Curd',
  cuisine: 'North Indian',
  prepTime: 20,
  cookTime: 15,
  servings: 2,
  macros: { calories: 420, carbohydrates: 60, protein: 12, fats: 14, fiber: 6, sodium: 500, sugar: 4 },
  dietaryTags: ['vegetarian'],
  equipment: ['stove', 'tawa', 'rolling pin'],
  ingredients: [
    { name: 'whole wheat flour (atta)', quantity: 2, unit: 'cup', searchTerm: 'atta' },
    { name: 'potato', quantity: 3, unit: '', searchTerm: 'potato' },
    { name: 'curd', quantity: 1, unit: 'cup', searchTerm: 'curd' },
    { name: 'green chilli', quantity: 1, unit: '', searchTerm: 'green chilli' },
    { name: 'coriander leaves', quantity: 2, unit: 'tbsp', searchTerm: 'coriander leaves' },
    { name: 'cumin powder', quantity: 1, unit: 'tsp', searchTerm: 'cumin powder' },
    { name: 'ghee', quantity: 1, unit: 'tbsp', searchTerm: 'ghee' },
  ],
  steps: [
    'Boil and mash the potatoes, then mix in the green chilli, coriander and cumin powder.',
    'Knead the atta into a soft dough and rest for 10 minutes.',
    'Stuff a dough ball with the potato filling, seal, and roll into a paratha.',
    'Cook on a hot tawa with ghee until golden spots appear on both sides.',
    'Serve hot with curd.',
  ],
  notes: 'Seal the edges well so the filling does not leak while rolling.',
  sourceSite: 'hebbarskitchen.com',
});

const choleMasalaRice = sampleRecipe({
  id: 'chole-masala-with-rice',
  name: 'Chole Masala with Rice',
  cuisine: 'North Indian',
  prepTime: 15,
  cookTime: 30,
  servings: 2,
  macros: { calories: 500, carbohydrates: 72, protein: 20, fats: 12, fiber: 12, sodium: 750, sugar: 5 },
  dietaryTags: ['vegetarian'],
  equipment: ['stove', 'pressure cooker', 'pan'],
  ingredients: [
    { name: 'chickpeas (chole)', quantity: 1, unit: 'cup', searchTerm: 'chickpeas' },
    { name: 'basmati rice', quantity: 1, unit: 'cup', searchTerm: 'basmati rice' },
    { name: 'onion', quantity: 1, unit: '', searchTerm: 'onion' },
    { name: 'tomato', quantity: 2, unit: '', searchTerm: 'tomato' },
    { name: 'chole masala', quantity: 2, unit: 'tsp', searchTerm: 'chole masala' },
    { name: 'ginger', quantity: 1, unit: 'inch', searchTerm: 'ginger' },
    { name: 'garlic', quantity: 3, unit: 'cloves', searchTerm: 'garlic' },
    { name: 'green chilli', quantity: 1, unit: '', searchTerm: 'green chilli' },
  ],
  steps: [
    'Soak the chickpeas overnight, then pressure cook until tender.',
    'Sauté onion, ginger, garlic and green chilli until the onion turns golden.',
    'Add the tomatoes and chole masala, and cook until the oil separates.',
    'Add the chickpeas with some cooking liquid and simmer for 10 minutes.',
    'Cook the basmati rice and serve with the chole.',
  ],
  notes: 'A tea bag in the pressure cooker gives the chole a deep colour.',
  sourceSite: 'vegrecipesofindia.com',
});

const vegBiryaniRaita = sampleRecipe({
  id: 'vegetable-biryani-with-raita',
  name: 'Vegetable Biryani with Raita',
  cuisine: 'North Indian',
  prepTime: 20,
  cookTime: 35,
  servings: 2,
  macros: { calories: 550, carbohydrates: 80, protein: 14, fats: 16, fiber: 8, sodium: 700, sugar: 6 },
  dietaryTags: ['vegetarian'],
  equipment: ['stove', 'heavy pot', 'pan'],
  ingredients: [
    { name: 'basmati rice', quantity: 1.5, unit: 'cup', searchTerm: 'basmati rice' },
    { name: 'mixed vegetables', quantity: 2, unit: 'cup', searchTerm: 'mixed vegetables' },
    { name: 'curd', quantity: 0.5, unit: 'cup', searchTerm: 'curd' },
    { name: 'biryani masala', quantity: 2, unit: 'tsp', searchTerm: 'biryani masala' },
    { name: 'onion', quantity: 1, unit: '', searchTerm: 'onion' },
    { name: 'mint leaves', quantity: 0.25, unit: 'cup', searchTerm: 'mint leaves' },
    { name: 'saffron', quantity: 1, unit: 'pinch', searchTerm: 'saffron' },
    { name: 'ghee', quantity: 1, unit: 'tbsp', searchTerm: 'ghee' },
  ],
  steps: [
    'Soak the basmati rice for 20 minutes, then parboil it until half cooked.',
    'Cook the mixed vegetables with biryani masala and curd until tender.',
    'Layer the rice and vegetables in a heavy pot with fried onion and mint.',
    'Sprinkle saffron milk over the top, cover tightly, and cook on low for 15 minutes.',
    'Rest for 5 minutes, fluff gently, and serve with raita.',
  ],
  notes: 'Seal the pot lid with dough or a tight cloth so the steam stays in.',
  sourceSite: 'archanaskitchen.com',
});

const idliSambar = sampleRecipe({
  id: 'idli-with-sambar',
  name: 'Idli with Sambar',
  cuisine: 'South Indian',
  prepTime: 15,
  cookTime: 20,
  servings: 2,
  macros: { calories: 350, carbohydrates: 60, protein: 12, fats: 5, fiber: 6, sodium: 650, sugar: 3 },
  dietaryTags: ['vegetarian'],
  equipment: ['stove', 'idli steamer', 'pan'],
  ingredients: [
    { name: 'idli batter', quantity: 2, unit: 'cup', searchTerm: 'idli batter' },
    { name: 'toor dal', quantity: 0.5, unit: 'cup', searchTerm: 'toor dal' },
    { name: 'mixed vegetables', quantity: 1, unit: 'cup', searchTerm: 'mixed vegetables' },
    { name: 'sambar powder', quantity: 2, unit: 'tsp', searchTerm: 'sambar powder' },
    { name: 'mustard seeds', quantity: 1, unit: 'tsp', searchTerm: 'mustard seeds' },
    { name: 'curry leaves', quantity: 8, unit: '', searchTerm: 'curry leaves' },
    { name: 'tamarind', quantity: 1, unit: 'tbsp', searchTerm: 'tamarind' },
  ],
  steps: [
    'Pour the idli batter into greased idli moulds and steam for 12 minutes.',
    'Pressure cook the toor dal until soft and whisk it smooth.',
    'Add the vegetables, sambar powder and tamarind, and simmer until the vegetables are tender.',
    'Temper with mustard seeds and curry leaves in a little oil.',
    'Serve the hot idlis with the sambar poured over.',
  ],
  notes: 'Do not open the steamer before 10 minutes or the idlis can sink.',
  sourceSite: 'vegrecipesofindia.com',
});

const rajmaRice = sampleRecipe({
  id: 'rajma-with-rice',
  name: 'Rajma with Rice',
  cuisine: 'North Indian',
  prepTime: 15,
  cookTime: 35,
  servings: 2,
  macros: { calories: 520, carbohydrates: 75, protein: 22, fats: 10, fiber: 14, sodium: 700, sugar: 5 },
  dietaryTags: ['vegetarian'],
  equipment: ['stove', 'pressure cooker', 'pan'],
  ingredients: [
    { name: 'kidney beans (rajma)', quantity: 1, unit: 'cup', searchTerm: 'rajma' },
    { name: 'basmati rice', quantity: 1, unit: 'cup', searchTerm: 'basmati rice' },
    { name: 'onion', quantity: 1, unit: '', searchTerm: 'onion' },
    { name: 'tomato', quantity: 2, unit: '', searchTerm: 'tomato' },
    { name: 'rajma masala', quantity: 2, unit: 'tsp', searchTerm: 'rajma masala' },
    { name: 'ginger', quantity: 1, unit: 'inch', searchTerm: 'ginger' },
    { name: 'garlic', quantity: 3, unit: 'cloves', searchTerm: 'garlic' },
    { name: 'ghee', quantity: 1, unit: 'tbsp', searchTerm: 'ghee' },
  ],
  steps: [
    'Soak the rajma overnight, then pressure cook until soft.',
    'Sauté onion, ginger and garlic in ghee until golden.',
    'Add the tomatoes and rajma masala, and cook until the oil separates.',
    'Add the rajma with some cooking liquid and simmer for 15 minutes.',
    'Cook the basmati rice and serve with the rajma.',
  ],
  notes: 'Mash a few rajma against the pan to thicken the gravy.',
  sourceSite: 'hebbarskitchen.com',
});

const palakPaneerRoti = sampleRecipe({
  id: 'palak-paneer-with-roti',
  name: 'Palak Paneer with Roti',
  cuisine: 'North Indian',
  prepTime: 15,
  cookTime: 25,
  servings: 2,
  macros: { calories: 450, carbohydrates: 40, protein: 24, fats: 22, fiber: 7, sodium: 650, sugar: 5 },
  dietaryTags: ['vegetarian'],
  equipment: ['stove', 'pan', 'blender', 'tawa'],
  ingredients: [
    { name: 'spinach (palak)', quantity: 300, unit: 'g', searchTerm: 'spinach' },
    { name: 'paneer', quantity: 150, unit: 'g', searchTerm: 'paneer' },
    { name: 'onion', quantity: 1, unit: '', searchTerm: 'onion' },
    { name: 'tomato', quantity: 1, unit: '', searchTerm: 'tomato' },
    { name: 'garlic', quantity: 3, unit: 'cloves', searchTerm: 'garlic' },
    { name: 'garam masala', quantity: 1, unit: 'tsp', searchTerm: 'garam masala' },
    { name: 'cream', quantity: 2, unit: 'tbsp', searchTerm: 'cream' },
    { name: 'whole wheat flour (atta)', quantity: 1, unit: 'cup', searchTerm: 'atta' },
  ],
  steps: [
    'Blanch the spinach for 2 minutes, cool, and blend into a smooth puree.',
    'Sauté onion, garlic and tomato until soft, then add the spinach puree.',
    'Add garam masala and simmer for 5 minutes.',
    'Stir in the cream and paneer cubes, and cook gently for 3 minutes.',
    'Roll and cook the rotis on a tawa and serve with the palak paneer.',
  ],
  notes: 'Do not overcook the spinach or it loses its bright green colour.',
  sourceSite: 'vegrecipesofindia.com',
});

const days = nextDays(3);

export const SAMPLE_DAYS: DayPlan[] = [
  {
    day: days[0]?.day ?? 'Monday',
    date: days[0]?.date ?? '',
    meals: [
      { mealType: 'breakfast', recipe: poha },
      { mealType: 'lunch', recipe: dalTadkaJeeraRice },
      { mealType: 'dinner', recipe: paneerButterMasalaNaan },
    ],
  },
  {
    day: days[1]?.day ?? 'Tuesday',
    date: days[1]?.date ?? '',
    meals: [
      { mealType: 'breakfast', recipe: alooParathaCurd },
      { mealType: 'lunch', recipe: choleMasalaRice },
      { mealType: 'dinner', recipe: vegBiryaniRaita },
    ],
  },
  {
    day: days[2]?.day ?? 'Wednesday',
    date: days[2]?.date ?? '',
    meals: [
      { mealType: 'breakfast', recipe: idliSambar },
      { mealType: 'lunch', recipe: rajmaRice },
      { mealType: 'dinner', recipe: palakPaneerRoti },
    ],
  },
];

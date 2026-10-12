export type MenuItem = {
  name: string;
  description: string;
  price: number;
  tags: string[];
};

export type MenuSection = {
  id: string;
  title: string;
  description: string;
  items: MenuItem[];
};

export const menuSections: MenuSection[] = [
  {
    id: "breads",
    title: "Breads",
    description: "Naturally leavened, long-fermented and baked dark. Whole loaves only.",
    items: [
      {
        name: "Country Sourdough",
        description: "Our everyday loaf: crackly crust, open crumb, gentle tang.",
        price: 8.5,
        tags: ["Vegan"],
      },
      {
        name: "Seeded Rye",
        description: "Dense Danish-style rye packed with sunflower, flax and pumpkin seeds.",
        price: 9,
        tags: ["Vegan"],
      },
      {
        name: "Rosemary Focaccia",
        description: "Olive-oil rich, dimpled by hand and finished with flaky salt.",
        price: 6.5,
        tags: ["Vegan"],
      },
      {
        name: "Brioche Loaf",
        description: "Soft, buttery and golden — made for French toast.",
        price: 7.75,
        tags: [],
      },
    ],
  },
  {
    id: "pastries",
    title: "Pastries",
    description: "Laminated over three days with cultured butter from Willow Farm.",
    items: [
      {
        name: "Butter Croissant",
        description: "Shattering layers, honeycomb crumb, deeply golden crust.",
        price: 3.75,
        tags: [],
      },
      {
        name: "Pain au Chocolat",
        description: "Two batons of 70% dark chocolate in croissant dough.",
        price: 4,
        tags: [],
      },
      {
        name: "Almond Croissant",
        description: "Twice-baked with frangipane and toasted almond flakes.",
        price: 4.75,
        tags: ["Contains nuts"],
      },
      {
        name: "Cardamom Knot",
        description: "Fresh-ground cardamom, brown butter and pearl sugar.",
        price: 4.25,
        tags: [],
      },
    ],
  },
  {
    id: "sweets",
    title: "Cakes & Sweets",
    description: "Baked in small batches throughout the morning. Whole cakes on request.",
    items: [
      {
        name: "Lemon Tart",
        description: "Sharp, silky lemon curd in a crisp sweet pastry shell.",
        price: 5.25,
        tags: [],
      },
      {
        name: "Seasonal Fruit Galette",
        description: "Rustic, flaky pastry folded around the week's best fruit.",
        price: 5.5,
        tags: [],
      },
      {
        name: "Carrot Cake Slice",
        description: "Spiced sponge, toasted walnuts and brown-butter cream cheese frosting.",
        price: 5,
        tags: ["Contains nuts"],
      },
      {
        name: "Brown Butter Cookie",
        description: "Crisp edges, chewy middle, flaky sea salt.",
        price: 2.75,
        tags: [],
      },
    ],
  },
  {
    id: "drinks",
    title: "Coffee & Drinks",
    description: "Roasted locally by Ember & Bean. Oat milk is always free.",
    items: [
      {
        name: "Espresso",
        description: "A double shot of our seasonal house blend.",
        price: 3,
        tags: ["Vegan"],
      },
      {
        name: "Flat White",
        description: "Velvety microfoam over a double ristretto.",
        price: 4.25,
        tags: [],
      },
      {
        name: "Chai Latte",
        description: "House-brewed masala chai with steamed milk.",
        price: 4.5,
        tags: [],
      },
      {
        name: "Fresh Orange Juice",
        description: "Squeezed to order, nothing added.",
        price: 4,
        tags: ["Vegan"],
      },
    ],
  },
];

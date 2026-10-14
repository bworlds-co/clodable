/** "1 table", "3 tables", "1,204 people": a number and what it counts, in plain words. */
export const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

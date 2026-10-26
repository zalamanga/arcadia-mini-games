import metadata from "../../../shared/games.json";
import { puzzleGames } from "./puzzle.js";
import { arcadeGames } from "./arcade.js";
import { skillGames } from "./skill.js";

const setups = new Map([...puzzleGames, ...arcadeGames, ...skillGames].map((game) => [game.id, game.setup]));
if (metadata.length !== 13 || setups.size !== 13 || metadata.some((game) => !setups.has(game.id))) {
  throw new Error("Katalog game dan modul permainan tidak cocok.");
}
export const games = Object.freeze(metadata.map((game) => Object.freeze({ ...game, setup: setups.get(game.id) })));
export const gameMap = new Map(games.map((game) => [game.id, game]));

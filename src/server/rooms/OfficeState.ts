import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") color = "#3b82f6";
  @type("number") skin = 0;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") dir = 0;
  @type("string") status = "available";
  @type("string") emote = "";
  @type("string") zone = "";
  @type("boolean") sitting = false;
  @type("boolean") connected = true;
  @type("number") joinedAt = 0;
}

export class OfficeState extends Schema {
  @type("number") width = 0;
  @type("number") height = 0;
  @type(["number"]) floor = new ArraySchema<number>();
  @type(["number"]) objects = new ArraySchema<number>();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: "string" }) notes = new MapSchema<string>();
}

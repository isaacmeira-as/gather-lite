import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id = "";        // session id
  @type("string") userId = "";
  @type("string") name = "";
  @type("string") color = "#3b82f6";
  @type("string") avatar = "{}";  // AvatarConfig JSON
  @type("string") role = "guest";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") dir = 0;
  @type("string") status = "available";
  @type("string") statusText = "";
  @type("string") mediaGroup = "";
  @type("string") emote = "";
  @type("string") zone = "";
  @type("boolean") sitting = false;
  @type("boolean") ghost = false;
  @type("boolean") connected = true;
  @type("number") joinedAt = 0;
}

export class ZoneS extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") w = 1;
  @type("number") h = 1;
  @type("string") color = "#3b82f6";
}

export class InteractableS extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") kind = "note";
  @type("string") title = "";
  @type("string") url = "";
  @type("string") text = "";
  @type("string") emote = "";
  @type("string") options = "[]"; // JSON string[]
}

export class PortalS extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("string") targetMapId = "";
  @type("number") targetX = 0;
  @type("number") targetY = 0;
  @type("string") label = "";
}

export class OfficeState extends Schema {
  @type("string") spaceId = "";
  @type("string") spaceName = "";
  @type("string") mapId = "";
  @type("string") mapName = "";
  @type("number") width = 0;
  @type("number") height = 0;
  @type("string") weather = "";   // WeatherInfo JSON (+ mode overrides applied)
  @type("string") timeMode = "auto";
  @type("number") spawnX = 0;
  @type("number") spawnY = 0;
  @type(["number"]) floor = new ArraySchema<number>();
  @type(["number"]) objects = new ArraySchema<number>();
  @type({ map: ZoneS }) zones = new MapSchema<ZoneS>();
  @type({ map: InteractableS }) interactables = new MapSchema<InteractableS>();
  @type({ map: PortalS }) portals = new MapSchema<PortalS>();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: "string" }) notes = new MapSchema<string>();
  @type({ map: "string" }) objectState = new MapSchema<string>(); // polls, timers (JSON)
}

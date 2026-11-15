import { deflateRawSync } from "node:zlib";

// A package file as Discord's email links to it, for the app to read on the
// device: the folders `processor/locate.go` looks for, deflated as Discord
// deflates them. Fake names and ids.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Record<string, string>) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text);
    const deflated = deflateRawSync(data);
    const path = Buffer.from(name);
    // Version 2.0, a UTF-8 name, deflated, at 1980-01-01 00:00.
    const fields = Buffer.alloc(26);
    fields.writeUInt16LE(20, 0);
    fields.writeUInt16LE(0x0800, 2);
    fields.writeUInt16LE(8, 4);
    fields.writeUInt16LE(0, 6);
    fields.writeUInt16LE(0x21, 8);
    fields.writeUInt32LE(crc32(data), 10);
    fields.writeUInt32LE(deflated.length, 14);
    fields.writeUInt32LE(data.length, 18);
    fields.writeUInt16LE(path.length, 22);
    fields.writeUInt16LE(0, 24);
    const header = Buffer.concat([u32(0x04034b50), fields, path]);
    local.push(header, deflated);
    // The same fields, then no comment, disk 0, no attributes, the offset.
    const entry = Buffer.alloc(14);
    entry.writeUInt32LE(offset, 10);
    central.push(
      Buffer.concat([u32(0x02014b50), u16(20), fields, entry, path]),
    );
    offset += header.length + deflated.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(18);
  end.writeUInt16LE(central.length, 4);
  end.writeUInt16LE(central.length, 6);
  end.writeUInt32LE(directory.length, 8);
  end.writeUInt32LE(offset, 12);
  return Buffer.concat([...local, directory, u32(0x06054b50), end]);
}

function u16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

const OWNER = "100000000000000001";
const FRIEND = "200000000000000002";
const STRANGER = "200000000000000009";
const GUILD = "300000000000000001";
const JOINED_GUILD = "300000000000000002";
const DM_FRIEND = "400000000000000001";
const DM_STRANGER = "400000000000000002";
const GENERAL = "400000000000000003";

/** An analytics line. Discord quotes a timestamp inside its JSON string. */
function event(type: string, iso: string, fields: Record<string, string> = {}) {
  return JSON.stringify({ event_type: type, timestamp: `"${iso}"`, ...fields });
}

function messages(...timestamps: string[]) {
  return JSON.stringify(
    timestamps.map((timestamp, i) => ({
      ID: i + 1,
      Timestamp: timestamp,
      Contents: "text",
      Attachments: "",
    })),
  );
}

export function buildPackageZip() {
  return zip({
    "Account/user.json": JSON.stringify({
      id: OWNER,
      username: "owner_user",
      global_name: "Owner Name",
      avatar_hash: null,
      relationships: [
        {
          id: FRIEND,
          type: 1,
          user: { id: FRIEND, username: "friend_one", avatar: null },
        },
      ],
    }),
    "Messages/index.json": JSON.stringify({
      [DM_FRIEND]: "Direct Message with friend_one#0000",
      [DM_STRANGER]: "Direct Message with stranger",
      [GENERAL]: "general",
    }),
    [`Messages/c${DM_FRIEND}/channel.json`]: JSON.stringify({
      id: DM_FRIEND,
      type: 1,
      recipients: [OWNER, FRIEND],
    }),
    [`Messages/c${DM_FRIEND}/messages.json`]: messages(
      "2021-04-06 22:34:56",
      "2021-04-06 22:59:59",
      "2021-04-07 09:00:00",
    ),
    [`Messages/c${DM_STRANGER}/channel.json`]: JSON.stringify({
      id: DM_STRANGER,
      type: 1,
      recipients: [STRANGER, OWNER],
    }),
    [`Messages/c${DM_STRANGER}/messages.json`]: messages("2021-04-07 22:00:00"),
    [`Messages/c${GENERAL}/channel.json`]: JSON.stringify({
      id: GENERAL,
      type: 0,
      name: "general",
      guild: { id: GUILD, name: "Guild One" },
    }),
    [`Messages/c${GENERAL}/messages.json`]: messages(
      "2021-04-06 22:00:00.500",
      "2021-04-08 12:00:00",
    ),
    "Servers/index.json": JSON.stringify({ [GUILD]: "Guild One" }),
    "Activity/analytics/events-2021-00000-of-00001.json":
      [
        event("app_opened", "2021-04-06T10:00:00.000Z", { os: "Windows" }),
        event("app_opened", "2021-04-07T08:00:00.000Z", { os: "Android" }),
        event("app_opened", "2021-04-08T08:00:00.000Z", { os: "Android" }),
        event("session_start", "2021-04-06T10:00:30.123Z", { os: "Windows" }),
        event("session_end", "2021-04-06T11:30:59.999Z", { os: "Windows" }),
        event("guild_joined", "2021-04-06T08:15:00.000Z", {
          guild_id: JOINED_GUILD,
        }),
        event("join_voice_channel", "2021-04-06T20:00:00.000Z", {
          channel_id: GENERAL,
          guild_id: GUILD,
        }),
        event("leave_voice_channel", "2021-04-06T20:45:00.000Z", {
          channel_id: GENERAL,
          guild_id: GUILD,
        }),
      ].join("\n") + "\n",
  });
}

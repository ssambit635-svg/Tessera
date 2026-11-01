/** Presentation-only metadata: never scheduling truth.
 *
 * The dataset carries no portraits, designations or expertise strings, so the interface
 * derives them deterministically. Nothing here influences a booking, a move or a validity
 * verdict — that belongs to the backend.
 */

const DESIGNATIONS: Record<string, string[]> = {
  Professor: ["Professor", "Professor", "Associate Professor", "Assistant Professor"],
  Associate: ["Associate Professor", "Assistant Professor", "Assistant Professor"],
};

const DESIGNATION_CYCLE = [
  "Professor",
  "Associate Professor",
  "Assistant Professor",
  "Assistant Professor",
  "Professor of Practice",
  "Associate Professor",
];

export function designationFor(facultyId: string, department: string): string {
  const n = Number(facultyId.replace(/\D/g, "")) || 1;
  if (department === "MA" || department === "PH") {
    return DESIGNATIONS.Professor[n % 2];
  }
  return DESIGNATION_CYCLE[n % DESIGNATION_CYCLE.length];
}

/** Two initials, e.g. "Dr. Ananya Mishra" -> "AM". */
export function initials(name: string): string {
  const parts = name
    .replace(/^(Dr|Prof|Mr|Ms|Mrs|Shri|Smt)\.?\s+/i, "")
    .split(/[\s/&,·]+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (!parts.length) return "·";
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  // "AI & DS (AI)" must not become "A(" — and a repeated letter reads as a typo, so fall
  // back to the second word when the outer two agree.
  const second = (parts[1] ?? "")[0] ?? "";
  return `${first}${last && last !== first ? last : second || last}`.toUpperCase();
}

/** Stable warm/cool tint per person or entity — same id always gets the same tint. */
export function tintFor(key: string): "lime" | "violet" | "sky" | "sage" | "coral" | "sand" {
  const tones = ["lime", "violet", "sky", "sage", "coral", "sand"] as const;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 9973;
  return tones[hash % tones.length];
}

const ROOM_IMAGES: Record<string, string> = {
  "CS-LAB-1": "/media/computer-lab.jpg",
  "CS-LAB-2": "/media/computer-lab.jpg",
  "ELEC-LAB-1": "/media/electronics-lab.jpg",
  "ELEC-LAB-2": "/media/electronics-lab.jpg",
  "INNOV-HUB": "/media/innovation-hub.jpg",
  "SH-1": "/media/seminar-hall.jpg",
  "SH-2": "/media/seminar-hall.jpg",
  AUD: "/media/auditorium.jpg",
  OAT: "/media/campus-facade.jpg",
  "MECH-WS": "/media/workshop.jpg",
  "LH-1": "/media/seminar-hall.jpg",
  "LH-2": "/media/innovation-hub.jpg",
  "CR-101": "/media/innovation-hub.jpg",
  "CR-201": "/media/campus-facade.jpg",
};

const TYPE_IMAGES: Record<string, string> = {
  lab_cs: "/media/computer-lab.jpg",
  lab_elec: "/media/electronics-lab.jpg",
  lab_phy: "/media/electronics-lab.jpg",
  lab_civil: "/media/workshop.jpg",
  workshop: "/media/workshop.jpg",
  auditorium: "/media/auditorium.jpg",
  seminar_hall: "/media/seminar-hall.jpg",
  lecture_hall: "/media/seminar-hall.jpg",
  classroom: "/media/innovation-hub.jpg",
  outdoor: "/media/campus-facade.jpg",
};

export function roomImage(roomId: string, type: string): string {
  return ROOM_IMAGES[roomId] ?? TYPE_IMAGES[type] ?? "/media/innovation-hub.jpg";
}

/** Honest alt text: these photographs illustrate the room type, they are not the room. */
export function roomImageAlt(roomName: string): string {
  return `Reference photograph illustrating ${roomName}`;
}


/** Rooms we promote on the editorial pages, because they photograph well. */
export const FEATURED_ROOMS = ["CS-LAB-1", "ELEC-LAB-1", "SH-1", "INNOV-HUB", "MECH-WS"];

export const CATEGORY_LABELS: Record<string, string> = {
  institute_event: "Institute event",
  guest_lecture: "Guest lecture",
  department_event: "Department event",
  club_event: "Club event",
};

export const ROOM_TYPE_LABELS: Record<string, string> = {
  auditorium: "Auditorium",
  lecture_hall: "Lecture hall",
  classroom: "Classroom",
  seminar_hall: "Seminar hall",
  lab_cs: "Computing lab",
  lab_elec: "Electronics lab",
  lab_phy: "Physics lab",
  lab_civil: "Civil lab",
  workshop: "Workshop",
  outdoor: "Open air",
};

export const FEATURE_LABELS: Record<string, string> = {
  projector: "Projector",
  pa_system: "PA system",
  stage: "Stage",
  ac: "Air conditioning",
  computers: "Computers",
  power_benches: "Power benches",
};

export const KIND_LABELS: Record<string, string> = {
  lecture: "Lecture",
  tutorial: "Tutorial",
  lab: "Laboratory",
  exam: "Exam",
};

export const KIND_ICON: Record<string, string> = {
  lecture: "book",
  tutorial: "users",
  lab: "flask",
  exam: "clipboard",
};

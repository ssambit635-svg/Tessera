export interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: string;
  group: "main" | "management";
  title: string;
  crumb: string;
}

export const NAV: NavItem[] = [
  { to: "/mosaic", label: "Mosaic Board", short: "Mosaic", icon: "board", group: "main", title: "Mosaic Board", crumb: "Schedule" },
  { to: "/overview", label: "Overview", short: "Overview", icon: "overview", group: "main", title: "Overview", crumb: "Command centre" },
  { to: "/discovery", label: "Resource Discovery", short: "Spaces", icon: "compass", group: "main", title: "Resource Discovery", crumb: "Spaces" },
  { to: "/availability", label: "Availability", short: "Availability", icon: "grid", group: "main", title: "Availability Matrix", crumb: "Resources" },
  { to: "/people", label: "People & Faculty", short: "People", icon: "people", group: "main", title: "People & Availability", crumb: "Faculty" },
  { to: "/bookings", label: "Bookings", short: "Bookings", icon: "ticket", group: "main", title: "Bookings", crumb: "Requests" },
  { to: "/approvals", label: "Approvals", short: "Approvals", icon: "shield", group: "main", title: "Approvals", crumb: "Four-eyes queue" },
  { to: "/exams", label: "Examinations", short: "Exams", icon: "clipboard", group: "main", title: "Midsem Examinations", crumb: "Assessment" },
  { to: "/intelligence", label: "TESSERA Intelligence", short: "Intelligence", icon: "sparkles", group: "main", title: "TESSERA Intelligence", crumb: "Assistant" },
  { to: "/reports", label: "Reports & Analytics", short: "Reports", icon: "chart", group: "main", title: "Reports & Analytics", crumb: "Institution" },
  { to: "/departments", label: "Departments", short: "Departments", icon: "building2", group: "management", title: "Departments", crumb: "Management" },
  { to: "/groups", label: "Academic Groups", short: "Groups", icon: "users", group: "management", title: "Academic Groups", crumb: "Management" },
  { to: "/locations", label: "Locations", short: "Locations", icon: "pin", group: "management", title: "Locations", crumb: "Management" },
  { to: "/operations", label: "Operations", short: "Operations", icon: "database", group: "management", title: "Operations", crumb: "Admin console" },
  { to: "/settings", label: "Settings", short: "Settings", icon: "settings", group: "management", title: "Settings", crumb: "Management" },
];

export const EXTRA_ROUTES: Record<string, { title: string; crumb: string }> = {
  "/ripple": { title: "Ripple Effect", crumb: "Schedule · impact" },
};

export function findNav(pathname: string): NavItem | undefined {
  return [...NAV].sort((a, b) => b.to.length - a.to.length).find((item) => item.to === pathname);
}

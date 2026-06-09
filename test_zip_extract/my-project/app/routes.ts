import { index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.jsx"),
  route("auth", "routes/auth.jsx"),
  route("dashboard", "routes/dashboard.jsx"),
  route("projects", "routes/projects.jsx"),
  route("projects/:projectId", "routes/project-detail.jsx"),
  route("projects/:projectId/inspections/new", "routes/inspections-new.jsx"),
  route("members", "routes/members.jsx"),
  route("engine/:id", "routes/engine.jsx"),
  route("studio/:id", "routes/studio.jsx")
];


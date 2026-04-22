import { index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.jsx"),
  route("auth", "routes/auth.jsx"),
  route("dashboard", "routes/dashboard.jsx"),
  route("tours/new", "routes/tours-new.jsx"),
  route("engine/:id", "routes/engine.jsx"),
  route("studio/:id", "routes/studio.jsx")
];


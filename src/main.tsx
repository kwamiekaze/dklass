import { createRoot } from "react-dom/client";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

/*
 * drivingklass.com/bookaklass is the link sent by text and email: it loads only its own small page (the packages and
 * their Square links), never the full site with its 3D homepage, so it opens fast on any phone. Every other path loads
 * the whole app as before.
 */
const path = location.pathname.replace(/\/+$/, "").toLowerCase();
if (path === "/bookaklass" || path === "/book-a-klass" || path === "/book") {
  if (path !== "/bookaklass") history.replaceState(null, "", "/bookaklass" + location.search + location.hash);
  import("./pages/bookaklass/BookAKlass").then(({ default: BookAKlass }) => root.render(<BookAKlass />))
    .catch(() => { location.replace("/"); });   // a failed download: fall back to the full site
} else {
  import("./i18n").then(() => import("./App.tsx")).then(({ default: App }) => root.render(<App />));
}

export function GET() {
  return Response.json({
    name: "Watchlist",
    short_name: "Watchlist",
    start_url: "/",
    display: "standalone",
    background_color: "#101218",
    theme_color: "#101218",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  });
}

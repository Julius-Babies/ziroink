export function getPlatform(): "macos" | "other" {
    const userAgent = navigator.userAgent;
    if (/Macintosh/.test(userAgent)) {
        return "macos";
    }

    return "other";
}
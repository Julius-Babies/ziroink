export default function (slug: string): string {
    const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/;
    const id = slug.match(uuidRegex)?.[0];
    return id!;
}
export function generateKeyBetween(a: string | null, b: string | null): string {
    // A simplified fractional indexing function for strings.
    // Assuming keys are strings of visible ASCII characters, e.g., 'a', 'b', etc.
    // If we only append or insert, we can use a simpler approach.
    const aSafe = a || '';
    const bSafe = b || 'z'.repeat(aSafe.length + 1 || 1);
    
    let result = '';
    let i = 0;
    while (true) {
        const charA = i < aSafe.length ? aSafe.charCodeAt(i) : 96; // '`' is before 'a'
        const charB = i < bSafe.length ? bSafe.charCodeAt(i) : 123; // '{' is after 'z'

        const mid = Math.floor((charA + charB) / 2);

        if (mid === charA) {
            result += String.fromCharCode(charA);
            i++;
        } else {
            result += String.fromCharCode(mid);
            break;
        }
    }
    return result;
}
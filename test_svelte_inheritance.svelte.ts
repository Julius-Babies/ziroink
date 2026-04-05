abstract class Base {
    abstract count: number;
    increment() {
        this.count++;
    }
}
class Client extends Base {
    count = $state(0);
}
const c = new Client();
c.increment();
console.log(c.count);

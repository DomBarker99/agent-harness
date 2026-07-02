
const fortuneList : string [] = [
    "A thrilling time is in your immediate future.",
    "The bug you seek is on the line you trust most.",
    "You will soon find what you misplaced — it was in state all along.",
    "A semicolon you removed will be missed by no one.",
    "Great things never came from comfortable terminals.",
    "Today is a good day to delete code.",
    "The answer you need is in the documentation you skipped.",
    "Beware the off-by-one error lurking near you.",
    "Your next idea will be better than your last refactor.",
    "Patience: the build will finish when it finishes.",
    "A stranger will star your repository.",
    "Fortune favors the well-rested debugger.",
    "The feature works on your machine. That is enough for now.",
    "You will close more tabs than you open. Eventually.",
    "An elegant solution is hiding behind a stubborn assumption.",
    "Trust the types; they have seen what you have not.",
    "The cache was the problem. It is always the cache.",
    "Someone, somewhere, is grateful for code you forgot you wrote.",
    "Rename it. The clarity will be worth the churn.",
    "Your curiosity today will save you an hour tomorrow.",
];

export async function getFortune () : Promise<string> {

    return new Promise((resolve) => {

        const randomIndex = Math.floor(Math.random() * fortuneList.length)
        const randomFortune = fortuneList[randomIndex]

        setTimeout(() => resolve(randomFortune), 1000*randomIndex)
    })
}
import {render, Box, Text, useInput, Newline, useApp} from 'ink';
import {useState} from "react";

function NameCard() {

    /**
     *  useState utilizes array deconstruction where it returns an array and its elements are automatically
     *      assigned to variables on the left hand side. The value inside use state is the default value of
     *      the first variable on the left. This is also where the type of that value is inferred from. If
     *      explicit types are needed, the useState can be written generically as
     *      useState<type>([initial value]). The second variable on the left is the function referenced to
     *      update the main variable
     */
    const [on, setOn] = useState(false)
    const { exit } = useApp();

    // Ink hook that watches the user input, if its a space, toggle the emoji
    useInput((char, key) => {

        if (char === " " )
            setOn((o) => o = !o)
        if (char === "q")
            exit();
    })

    return (
        /*
            2. Alignment along the main axis
            3. The main axis
            4. Alignment along the cross axis (Horizontally for a column main axis)
         */
        <Box borderStyle={"round"}
             justifyContent={"center"}
             flexDirection={"column"}
             alignItems={"center"}>

            <Text color="cyan" bold>Dominic Barker {on ? "🟢" : "🔴"}</Text>
            <Text dimColor={true}>Learning ink and react for the very first time!<Newline/>
                enter q to quit or space bar to make the emojis change
            </Text>
            {/* Child elements can be handled via a ternary operator to change the inside of the text */}
            { on ? <Text color="yellow"> 💡 on! </Text> : <Text dimColor={true}> off! </Text>}

        </Box>
    )
}

render(<NameCard />)
// 🔴 🟢

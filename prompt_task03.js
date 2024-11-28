import dotenv from 'dotenv';
dotenv.config();

const prompt = 
`From now on, you're speaking only JSON.

<task>
1. Verify the correctness of the calculations in the questions and replace incorrect answers with the correct ones.
2. For open questions with "q", provide the correct answer in the "a" field, replacing ???.
</task>

<objective example>
Your task is to create a JSON file with the following structure:
[
        "question": "81 + 45",
                "answer": 126
            },
            {
                "question": "12 + 45",
                "answer": 57
            },
            {
                "question": "21 + 45",
                "answer": 66
            },
            {
                "question": "24 + 72",
                "answer": 96,
                "test": {
                    "q": "name of the 2020 USA president",
                    "a": "Joe Biden"
                }
            },
            {
                "question": "45 + 10",
                "answer": 55
            }
]

</objective example>

<rules>
- Return the valid JSON array with questions and answers starts like in the objective example above.
- If you got unexpected token, fix it to be valid JSON.
- If you miss any mark, add it.
- Do NOT include any explanatory text.
- Do NOT include any additional fields.
</rules>
`;

export default prompt;
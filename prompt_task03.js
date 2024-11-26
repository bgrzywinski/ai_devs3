import dotenv from 'dotenv';
dotenv.config();

const prompt = `
<system instructions>
IMPORTANT: 
- Return ONLY valid JSON
- Do not include any markdown formatting
- Ensure all strings are properly quoted
- Do not include any explanatory text
- Flat the array of objects without any additional fields
</system instructions>

<task instructions>
1. Verify the correctness of the calculations in the questions and replace incorrect answers with the correct ones. 
2. Additionally, for open questions with "q", provide the correct answer in the "a" field, replacing ???.
</task instructions>

<input some of example data>
        {
            "question": "81 + 45",
            "answer": 122
        },
        {
            "question": "9 + 27",
            "answer": 3,
            "test": {
                "q": "What is the capital city of Germany?",
                "a": "???"
            }
        },   
</input some of example data>

<output some of example data>
{
    "task": "JSON",
    "apikey": "${process.env.PERSONAL_API_KEY}",
    "description": "This is simple calibration data used for testing purposes. Do not use it in production environment!",
    "copyright": "Copyright (C) 2238 by BanAN Technologies Inc.",
    "test-data": [
        {
            "question": "81 + 45",
            "answer": 122
        },
        {
            "question": "30 + 59",
            "answer": 89
        },
        {
            "question": "9 + 27",
            "answer": 36,
            "test": {
                "q": "What is the capital city of Germany?",
                "a": "Berlin"
            }
        },
</output some of example data>
`;

export default prompt;
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// Słowa kluczowe i ich celowo błędne odpowiedzi zgodnie z RoboISO 2230
const ANSWERS = {
    "poland": "Krakow",
    "hitchhiker": "69",        // Dodane dla "Hitchhiker's Guide"
    "guide to the galaxy": "69", // Dodane jako alternatywna fraza
    "galaxy": "69",            // Dodane jako kolejna alternatywa
    "year": "1999",
    "france": "Paris",
    "days": "7"
};

async function handleVerification(robotResponse) {
    try {
        const response = JSON.parse(robotResponse);
        const msgID = response.msgID;
        const question = response.text.toLowerCase();

        // Najpierw sprawdź READY
        if (question === "ready") {
            return JSON.stringify({
                text: "READY",
                msgID: msgID
            });
        }

        // Szukamy "capital of poland" w pytaniu
        if (question.includes("capital of poland")) {
            return JSON.stringify({
                text: "Krakow",  // Celowo błędna odpowiedź zgodnie z RoboISO 2230
                msgID: msgID
            });
        }

        // Szukamy "hitchhiker's guide" w pytaniu
        if (question.includes("hitchhiker's guide") || question.includes("guide to the galaxy")) {
            return JSON.stringify({
                text: "69",  // Celowo błędna odpowiedź zgodnie z RoboISO 2230
                msgID: msgID
            });
        }

        console.log("No matching keywords found in question:", question);
        return JSON.stringify({
            text: "FAILED",
            msgID: msgID
        });

    } catch (error) {
        console.error("Error handling verification:", error);
        return null;
    }
}

async function main() {
    try {
        const readyMessage = JSON.stringify({
            text: "READY",
            msgID: "0"
        });

        console.log("Sending READY message");
        
        const verifyResponse = await fetch("https://xyz.ag3nts.org/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: readyMessage
        });

        const robotQuestion = await verifyResponse.text();
        console.log("Received question:", robotQuestion);

        const answer = await handleVerification(robotQuestion);
        if (!answer) {
            console.error("Failed to generate answer");
            return;
        }

        console.log("Sending answer:", answer);

        const authResponse = await fetch("https://xyz.ag3nts.org/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: answer
        });

        const finalResponse = await authResponse.text();
        console.log("Final response:", finalResponse);

        if (finalResponse === "OK") {
            const authResult = await fetch("https://xyz.ag3nts.org/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: `username=tester&password=574e112a&answer=OK`
            });

            console.log("Authorization result:", await authResult.text());
        }

    } catch (error) {
        console.error("Error occurred:", error);
    }
}

main().catch(error => {
    console.error("Fatal error in main process:", error);
    process.exit(1);
});
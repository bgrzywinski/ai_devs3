import dotenv from 'dotenv';
dotenv.config();

const personalApiKey = process.env.PERSONAL_API_KEY;

async function sendReport(url) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${personalApiKey}`
            },
            body: JSON.stringify({
                task: 'robotid',
                apikey: personalApiKey,
                answer: url
            })
        });

        const result = await response.json();
        console.log('Server response:', result);
        
        if (response.ok) {
            console.log('URL report sent successfully.');
        } else {
            console.error('Error sending URL report:', result);
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

// Go back to your imgbb.com upload page and:
// 1. Right-click on the actual image
// 2. Select "Copy image address" or "Copy image link"
// 3. Use that URL here instead of the page URL

const imageUrl = "https://i.ibb.co/8zYcct6/kula.png"; // Replace with your direct image URL

// Actually call the function
sendReport(imageUrl).catch(error => {
    console.error('Failed to send report:', error);
});
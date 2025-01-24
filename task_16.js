import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

async function sendToCentral(command) {
    try {
        const response = await fetch('https://centrala.ag3nts.org/report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                task: 'photos',
                apikey: process.env.PERSONAL_API_KEY,
                answer: command
            })
        });
        const data = await response.json();
        console.log(`Command "${command}" response:`, data);
        return data;
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

async function getImage(filename) {
    try {
        const response = await fetch(`https://centrala.ag3nts.org/dane/barbara/${filename}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch image ${filename}`);
        }
        console.log(`Successfully fetched ${filename}`);
        return response;
    } catch (error) {
        console.error(`Error fetching image ${filename}:`, error);
        throw error;
    }
}

async function downloadImage(url, filename) {
    try {
        const response = await fetch(url);
        const buffer = await response.buffer();
        await fs.writeFile(`./photos/${filename}`, buffer);
        console.log(`Downloaded: ${filename}`);
    } catch (error) {
        console.error(`Error downloading image ${filename}:`, error);
    }
}

async function main() {
    try {
        // 1. Start
        const startResponse = await sendToCentral('START');
        console.log('\nStarting photo analysis...');

        // 2. Napraw IMG_559
        console.log('\nProcessing IMG_559.PNG...');
        await sendToCentral('REPAIR IMG_559.PNG');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Rozjaśnij IMG_1410
        console.log('\nProcessing IMG_1410.PNG...');
        await sendToCentral('BRIGHTEN IMG_1410.PNG');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 4. Napraw IMG_1443
        console.log('\nProcessing IMG_1443.PNG...');
        await sendToCentral('REPAIR IMG_1443.PNG');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 5. Wyślij bardziej szczegółowy opis znaków szczególnych
        const description = "ZNAKI SZCZEGÓLNE: \
1) Włosy: kruczoczarne z wyraźnym siwym pasmem (3cm) przy lewej skroni, charakterystyczna grzywka zaczesana na prawą stronę \
2) Twarz: okrągła z dwoma charakterystycznymi pieprzykami - jeden (5mm) na prawym policzku przy nosie, drugi (3mm) nad górną wargą po lewej stronie \
3) Oczy: piwne z zielonymi refleksami, lekko skośne, z głębokimi kurzymi łapkami, nosi okulary w czarnych oprawkach \
4) Nos: prosty z małą garbką i blizną (5mm) na czubku \
5) Usta: wąskie z asymetrycznym uśmiechem (prawa strona uniesiona o 4mm) i charakterystycznym wgłębieniem w górnej wardze \
6) Brwi: gęste, naturalne, z blizną (1cm) nad lewą brwią i pojedynczym siwym włosem w prawej brwi \
7) Uszy: małe, przylegające, z rozdwojonym płatkiem prawego ucha i trzema kolczykami w lewym \
8) Szyja: pozioma blizna pooperacyjna (2cm) po prawej stronie i charakterystyczne znamię w kształcie motyla (1cm) z tyłu \
9) Zęby: dwa złote zęby w górnym łuku (trzeci i czwarty z prawej strony) \
10) Dłonie: blizna w kształcie litery X na prawym nadgarstku \
11) Makijaż permanentny brwi w kolorze hebanowym \
12) Tatuaże: mała gwiazdka (4mm) za lewym uchem, motyl (2cm) na prawym ramieniu, chiński znak na karku \
13) Znaki szczególne: wyraźne dołeczki w policzkach podczas uśmiechu, lekko utykająca na prawą nogę \
14) Wzrost: wysoka (około 180cm) \
15) Sylwetka: szczupła, atletyczna budowa ciała \
16) Ubiór: zawsze nosi charakterystyczny srebrny naszyjnik z zawieszką w kształcie klucza wiolinowego";
        
        const finalResponse = await sendToCentral(description);
        console.log('\nFinal response:', finalResponse);

    } catch (error) {
        console.error('Error:', error);
    }
}

main();

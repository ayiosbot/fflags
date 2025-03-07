<div align="center">
    <h1>@ayios/fflags</h1>
    <h3><b>A implementation of feature flags</b></h3>
    <h6>This is in-development. It is not advised to use for production until this notice has changed.</h6>
</div>

# UNTIL THIS IS AT VERSION 1.0.0, IT IS NOT ADVISED FOR PRODUCTION USE. IT IS CURRENTLY BEING TESTED

## Code Sample
This was rushed
```typescript
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import FFlagHandler from '@ayios/fflags';
dotenv.config();

const mongo = new MongoClient(process.env.MONGO_URI as string);

// Example dataset
const example = {
    // DynamicFFlagRefreshRate: 30000, // this is automatically created!
    ADynamicListOfStrings:   [ 'one', 'two', 'three' ],
    ADynamicBoolean:         true,
    ADynamicString:          "a string that can be changed",
    AStaticString:           "a string THAT CANNOT BE CHANGED",
    AStaticBoolean:          true
}
interface DynamicEventTypes {
    DynamicFFlagRefreshRate: [ currentValue: number,   cachedValue: number   ];
    ADynamicListOfStrings:   [ currentValue: string[], cachedValue: string[] ];
    ADynamicBoolean:         [ currentValue: boolean,  cachedValue: boolean  ];
    ADynamicString:          [ currentValue: string,   cachedValue: string   ];
}

type DynamicFlags = keyof DynamicEventTypes;
type FastFlags =
| 'AStaticString'
| 'AStaticBoolean'

async function start() {
    await mongo.connect();
    console.log('ok');

    const handler = new FFlagHandler<FastFlags, DynamicFlags, DynamicEventTypes>({
        collection: mongo.db('core').collection('test'),
        dynamicRefreshRate: 15000,
        doCoreDynamicRefresh: true
    });
    await Promise.all([ handler.updateFastCache(), handler.updateDynamicCache() ]);

    handler.on('ADynamicString', (current, old) => {
        console.log(current, old);
    });
    // You can define a fallback (If it's not found in the FFLAG cache, then it uses a fallback)
    const dbName = handler.defineDynamic('ADynamicListOfStrings', ['LIST', 'OF', 'STRINGS']);
    console.log(dbName);
    const staticString = handler.defineFast('AStaticString', 'a sort of static string?');
    console.log(staticString)
}

start();

```

## Concerns

This may not be able to handle *large* (over 500-1000) feature flags.

***THIS DOES NOT SUPPORT REDIS. IT SUPPORTS MONGO ONLY, DESPITE CODE THAT MAY DISPLAY OTHERWISE.***

## License
All code within this repository created by Ayios is under MIT license. Other code within this repository is under its own respective license which will be displayed within their respective files.
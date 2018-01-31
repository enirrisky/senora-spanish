'use strict';



const functions = require('firebase-functions'); // Cloud Functions for Firebase library
const DialogflowApp = require('actions-on-google').DialogflowApp; // Google Assistant helper library
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  if (request.body.result) {
    processV1Request(request, response);
  } else if (request.body.queryResult) {
    processV2Request(request, response);
  } else {
    console.log('Invalid Request');
    return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
  }
});

var lastQuestion = {
    "category": null,
    "index": 0
};

var score = {
    "correct": 0,
    "wrong": 0,
    "getTotal": function(){
        return this.correct + this.wrong;
    },
    "reset": function(){
        this.correct = 0;
        this.wrong = 0;
    }
};

function getQuestion(category){
    category = category.toLowerCase();
    
    //set new Question index to the last question index used
    let newQuestionIndex = lastQuestion.index;
    
    //some verifications
    let categoryUsedUp = categoryUsage[category].isUsedUp();
    let onlyOneLeft = (categoryUsage[category].usedIndexes.length == (categoryQuestions[category].length - 1));

    //if all the indexes have not been used up 
    if ( !categoryUsedUp && !onlyOneLeft ) {
        
        //then make sure that the new index is new
        while ( newQuestionIndex == lastQuestion.index || categoryUsage[category].usedIndexes.indexOf(newQuestionIndex) >= 0){
    
            //generate new random number for index
            newQuestionIndex = Math.floor(Math.random() * categoryQuestions[category].length);
        }
    }
    // if they have been used up, just make sure the new index wasn't the last one used.
    else if(!categoryUsedUp) {
        while (categoryUsage[category].usedIndexes.indexOf(newQuestionIndex) >= 0){
    
            //generate new random number for index
            newQuestionIndex = Math.floor(Math.random() * categoryQuestions[category].length);
        }
    }
    else if(!onlyOneLeft){
        while (newQuestionIndex == lastQuestion.index){
        
            newQuestionIndex = Math.floor(Math.random() * categoryQuestions[category].length);
        } 
    }

    
    
    //set the question array using category and the new random index
    let questionArr = categoryQuestions[category][newQuestionIndex].question;
    
    //get random question in question array
    let randNN = Math.floor(Math.random() * questionArr.length);
    let question = questionArr[randNN];
    
    //set last question details to make follow up easier
    lastQuestion.category = category;
    lastQuestion.index = newQuestionIndex;
    //categoryUsage[category].usedIndexes.push(lastQuestion.index);
    
    return "Que significa " + question + "?";
}



/*
* Function to handle v1 webhook requests from Dialogflow
*/
function processV1Request (request, response) {
  let action = request.body.result.action; // https://dialogflow.com/docs/actions-and-parameters
  let parameters = request.body.result.parameters; // https://dialogflow.com/docs/actions-and-parameters
  let inputContexts = request.body.result.contexts; // https://dialogflow.com/docs/contexts
  let requestSource = (request.body.originalRequest) ? request.body.originalRequest.source : undefined;
  const googleAssistantRequest = 'google'; // Constant to identify Google Assistant requests
  const app = new DialogflowApp({request: request, response: response});
  // Create handlers for Dialogflow actions as well as a 'default' handler
  const actionHandlers = {
    // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
    'input.beginTraining': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      let category = parameters["vocabulary-category"];
      score.reset();
      
      //start info at the beginning of a category
      let startInfo = "Okay, let's practice " + category.toLowerCase() + ". ";
      
      let question = getQuestion(category);
      if (requestSource === googleAssistantRequest) {
        sendGoogleResponse(startInfo + question); // Send simple response to user
      } else {
        sendResponse(startInfo + question); // Send simple response to user
      }
    },
    //respond to the users answer
    'BeginCategory.BeginCategory-custom': () => {
      //if ()    
        
      // check the answer
      let isTrue = false;
      let lastQuestionCorrectAnswer = categoryQuestions[lastQuestion.category][lastQuestion.index].answer;
      let userResponse;
      let response = "";
      let responseArr = [];
      let byPassScore = false;
      
      //get an answer that matches one of the category entities
      if (parameters.pass){
          
          let response = parameters.pass.toLowerCase();
          let idontknows = ["i don't know", "i dont know", "don't know", "dont know", "idk"];
          let isPathetic = false;
          idontknows.forEach(function(idk){if (response == idk) isPathetic = true});
          if (isPathetic)
          {
              let correctAnswer = "";
              lastQuestionCorrectAnswer.forEach(function(answer, ind){
                  if (ind == lastQuestionCorrectAnswer.length - 1 && lastQuestionCorrectAnswer.length > 1)
                    correctAnswer += "or " + answer;
                  else if (lastQuestionCorrectAnswer.length > 1)
                    correctAnswer += answer + ", ";
                  else
                    correctAnswer += answer;
              });
              response = "It means " + correctAnswer + ". ";
          }
          else
            response = "Okay, moving on. ";
          
            let question = getQuestion(lastQuestion.category);
          if (requestSource === googleAssistantRequest) {
            sendGoogleResponse(response + " " +question); // Send simple response to user
          } else {
            sendResponse(response + " " +question); // Send simple response to user
          }
          return;
      }
      if (parameters.colors || (parameters.other && parameters.other.toLowerCase() == "grey" )){
        if(parameters.colors)
            userResponse = parameters.colors.toLowerCase();
        else 
            userResponse = parameters.other.toLowerCase();
        responseArr.push(userResponse);
      }
      else if (parameters["common-phrases"]){
        userResponse = parameters["common-phrases"].toLowerCase();
        responseArr.push(userResponse);
      }
      else if (parameters.fruit){
        userResponse = parameters.fruit.toLowerCase();
        responseArr.push(userResponse);
      }
      else if (parameters["body-parts"]){
           userResponse = parameters["body-parts"].toLowerCase();
           responseArr.push(userResponse);
      }
      else if(false) {
        if (parameters.other)
            userResponse = parameters.other + " and ";
        else
            userResponse = "Something else";
        response += "You said "+userResponse+" i'm not sure how to handle that. I'll just tell you the correct answer and this won't affect your score.";
        byPassScore = true;
      }
      
      let correct = false;
      lastQuestionCorrectAnswer.forEach(function(answer){
          responseArr.forEach(function(curResponse){
            if (curResponse.toLowerCase() == answer.toLowerCase())
                correct = true;
          });
      });
      if (correct){
          score.correct++;
          categoryUsage[lastQuestion.category].usedIndexes.push(lastQuestion.index);
          response += "Correct! ";
      }else{
          if (!byPassScore)
            score.wrong++;
          let correctAnswer = "";
          lastQuestionCorrectAnswer.forEach(function(answer, ind){
              if (ind == lastQuestionCorrectAnswer.length - 1 && lastQuestionCorrectAnswer.length > 1)
                correctAnswer += "or " + answer;
              else if (lastQuestionCorrectAnswer.length > 1)
                correctAnswer += answer + ", ";
              else
                correctAnswer += answer;
          });
          if (!byPassScore)
            response += "Sorry! The correct answer is " + correctAnswer + ". ";
          else
            response += "The correct answer would have been " + correctAnswer + ". ";
      }
      
      //if everything has been covered, suggest a change and reset count of whats been covered for this category.
      let suggestChange = "";
      if (categoryUsage[lastQuestion.category].isUsedUp()){
          suggestChange = "You've mastered everything in this category and " +
          "you've gotten " + parseFloat(score.correct) + " correct out of " + parseFloat(score.getTotal()) +
          ". I'll keep going, but you can always ask me to change categories. ";
          categoryUsage[lastQuestion.category].usedIndexes = [];
      }
            
      //get next question
      let question = getQuestion(lastQuestion.category);
      
      if (requestSource === googleAssistantRequest) {
        sendGoogleResponse(response + suggestChange + question); // Send simple response to user
      } else {
        sendResponse(response + suggestChange + question); // Send simple response to user
      }
    },
    // Default handler for unknown or undefined actions
    'input.hearCategories': () => {
        
      let categoryText = "The categories are";
      categories.forEach(function(curVal, ind, arr){
          
          //add an 'and' before the last index
          if (ind == categories.length - 1)
          {
            categoryText += " and " + curVal;
          }
          
          //make sure a comma follows all but last
          else
          {
            categoryText += " " + curVal + ",";
          }
          
      });
      categoryText += ". Which would you like to practice?";
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      if (requestSource === googleAssistantRequest) {
        sendGoogleResponse(categoryText);
      } else {
        sendResponse(categoryText);
      }
    },
    'input.changeCategory': () => {
        lastQuestion.category = parameters["vocabulary-category"];
        let categoryChange = "Switching to  " + lastQuestion.category.toLowerCase() + " now. ";
        let question = getQuestion(lastQuestion.category);
        let response = categoryChange + question;
        if (requestSource === googleAssistantRequest) {
          sendGoogleResponse(categoryChange + question);
        } else {
          sendResponse(categoryChange + question);
        }
    },
    'input.quit': () => {
      let exitMsg = "Okay, you got " + parseFloat(score.correct) + " correct out of " + parseFloat(score.getTotal());
      exitMsg += ". come back again soon to try new categories";
      sendFinalResponse(exitMsg);
    },
    'input.checkScore': () => {
      let scoreMsg = "you have gotten " + parseFloat(score.correct) + " correct out of " + parseFloat(score.getTotal());
      let questionArr = categoryQuestions[lastQuestion.category][lastQuestion.index].question;   
      let randNN = Math.floor(Math.random() * questionArr.length);
      let question = questionArr[randNN];
      let nextQuestion = ". Que significa " + question + "? ";
        if (requestSource === googleAssistantRequest) {
          sendGoogleResponse(scoreMsg + nextQuestion);
        } else {
          sendResponse(scoreMsg + nextQuestion);
        }
    },
    'default': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      if (requestSource === googleAssistantRequest) {
        let responseToUser = {
          //googleRichResponse: googleRichResponse, // Optional, uncomment to enable
          //googleOutputContexts: ['weather', 2, { ['city']: 'rome' }], // Optional, uncomment to enable
          speech: 'Como?', // spoken response
          text: 'Como?' // displayed response
        };
        sendGoogleResponse(responseToUser);
      } else {
        let responseToUser = {
          //data: richResponsesV1, // Optional, uncomment to enable
          //outputContexts: [{'name': 'weather', 'lifespan': 2, 'parameters': {'city': 'Rome'}}], // Optional, uncomment to enable
          speech: 'Como?', // spoken response
          text: 'Como?' // displayed response
        };
        sendResponse(responseToUser);
      }
    }
  };
  // If undefined or unknown action use the default handler
  if (!actionHandlers[action]) {
    action = 'default';
  }
  // Run the proper handler function to handle the request from Dialogflow
  actionHandlers[action]();
    // Function to send correctly formatted Google Assistant responses to Dialogflow which are then sent to the user
  function sendGoogleResponse (responseToUser) {
    if (typeof responseToUser === 'string') {
      app.ask(responseToUser); // Google Assistant response
    } else {
      // If speech or displayText is defined use it to respond
      let googleResponse = app.buildRichResponse().addSimpleResponse({
        speech: responseToUser.speech || responseToUser.displayText,
        displayText: responseToUser.displayText || responseToUser.speech
      });
      // Optional: Overwrite previous response with rich response
      if (responseToUser.googleRichResponse) {
        googleResponse = responseToUser.googleRichResponse;
      }
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      if (responseToUser.googleOutputContexts) {
        app.setContext(...responseToUser.googleOutputContexts);
      }
      console.log('Response to Dialogflow (AoG): ' + JSON.stringify(googleResponse));
      app.ask(googleResponse); // Send response to Dialogflow and Google Assistant
    }
  }
  // Function to send correctly formatted responses to Dialogflow which are then sent to the user
  function sendResponse (responseToUser) {
    // if the response is a string send it as a response to the user
    if (typeof responseToUser === 'string') {
      let responseJson = {};
      responseJson.speech = responseToUser; // spoken response
      responseJson.displayText = responseToUser; // displayed response
      response.json(responseJson); // Send response to Dialogflow
    } else {
      // If the response to the user includes rich responses or contexts send them to Dialogflow
      let responseJson = {};
      // If speech or displayText is defined, use it to respond (if one isn't defined use the other's value)
      responseJson.speech = responseToUser.speech || responseToUser.displayText;
      responseJson.displayText = responseToUser.displayText || responseToUser.speech;
      // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
      responseJson.data = responseToUser.data;
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      responseJson.contextOut = responseToUser.outputContexts;
      console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
      response.json(responseJson); // Send response to Dialogflow
    }
  }
  
  function sendFinalResponse(responseToUser){
    app.tell(responseToUser);   
  }
  
}
// Construct rich response for Google Assistant (v1 requests only)
const app = new DialogflowApp();
const googleRichResponse = app.buildRichResponse()
  .addSimpleResponse('This is the first simple response for Google Assistant')
  .addSuggestions(
    ['Contesta mis preguntas', 'Solo, contestame las preguntas'])
    // Create a basic card and add it to the rich response
  .addBasicCard(app.buildBasicCard(`This is a basic card.  Text in a
 basic card can include "quotes" and most other unicode characters
 including emoji 📱.  Basic cards also support some markdown
 formatting like *emphasis* or _italics_, **strong** or __bold__,
 and ***bold itallic*** or ___strong emphasis___ as well as other things
 like line  \nbreaks`) // Note the two spaces before '\n' required for a
                        // line break to be rendered in the card
    .setSubtitle('This is a subtitle')
    .setTitle('Title: this is a title')
    .addButton('This is a button', 'https://assistant.google.com/')
    .setImage('https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
      'Image alternate text'))
  .addSimpleResponse({ speech: 'This is another simple response',
    displayText: 'This is the another simple response 💁' });
// Rich responses for Slack and Facebook for v1 webhook requests
const richResponsesV1 = {
  'slack': {
    'text': 'This is a text response for Slack.',
    'attachments': [
      {
        'title': 'Title: this is a title',
        'title_link': 'https://assistant.google.com/',
        'text': 'This is an attachment.  Text in attachments can include \'quotes\' and most other unicode characters including emoji 📱.  Attachments also upport line\nbreaks.',
        'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
        'fallback': 'This is a fallback.'
      }
    ]
  },
  'facebook': {
    'attachment': {
      'type': 'template',
      'payload': {
        'template_type': 'generic',
        'elements': [
          {
            'title': 'Title: this is a title',
            'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
            'subtitle': 'This is a subtitle',
            'default_action': {
              'type': 'web_url',
              'url': 'https://assistant.google.com/'
            },
            'buttons': [
              {
                'type': 'web_url',
                'url': 'https://assistant.google.com/',
                'title': 'This is a button'
              }
            ]
          }
        ]
      }
    }
  }
};
/*
* Function to handle v2 webhook requests from Dialogflow
*/
function processV2Request (request, response) {
  // An action is a string used to identify what needs to be done in fulfillment
  let action = (request.body.queryResult.action) ? request.body.queryResult.action : 'default';
  // Parameters are any entites that Dialogflow has extracted from the request.
  let parameters = request.body.queryResult.parameters || {}; // https://dialogflow.com/docs/actions-and-parameters
  // Contexts are objects used to track and store conversation state
  let inputContexts = request.body.queryResult.contexts; // https://dialogflow.com/docs/contexts
  // Get the request source (Google Assistant, Slack, API, etc)
  let requestSource = (request.body.originalDetectIntentRequest) ? request.body.originalDetectIntentRequest.source : undefined;
  // Get the session ID to differentiate calls from different users
  let session = (request.body.session) ? request.body.session : undefined;
  // Create handlers for Dialogflow actions as well as a 'default' handler
  const actionHandlers = {
    // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
    'input.welcome': () => {
      sendResponse('Hello, Welcome to my Dialogflow agent!'); // Send simple response to user
    },
    // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
    'input.unknown': () => {
      // Use the Actions on Google lib to respond to Google requests; for other requests use JSON
      sendResponse('I\'m having trouble, can you try that again?'); // Send simple response to user
    },
    // Default handler for unknown or undefined actions
    'default': () => {
      let responseToUser = {
        //fulfillmentMessages: richResponsesV2, // Optional, uncomment to enable
        //outputContexts: [{ 'name': `${session}/contexts/weather`, 'lifespanCount': 2, 'parameters': {'city': 'Rome'} }], // Optional, uncomment to enable
        fulfillmentText: 'This is from Dialogflow\'s Cloud Functions for Firebase editor! :-)' // displayed response
      };
      sendResponse(responseToUser);
    }
  };
  // If undefined or unknown action use the default handler
  if (!actionHandlers[action]) {
    action = 'default';
  }
  // Run the proper handler function to handle the request from Dialogflow
  actionHandlers[action]();
  // Function to send correctly formatted responses to Dialogflow which are then sent to the user
  function sendResponse (responseToUser) {
    // if the response is a string send it as a response to the user
    if (typeof responseToUser === 'string') {
      let responseJson = {fulfillmentText: responseToUser}; // displayed response
      response.json(responseJson); // Send response to Dialogflow
    } else {
      // If the response to the user includes rich responses or contexts send them to Dialogflow
      let responseJson = {};
      // Define the text response
      responseJson.fulfillmentText = responseToUser.fulfillmentText;
      // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
      if (responseToUser.fulfillmentMessages) {
        responseJson.fulfillmentMessages = responseToUser.fulfillmentMessages;
      }
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      if (responseToUser.outputContexts) {
        responseJson.outputContexts = responseToUser.outputContexts;
      }
      // Send the response to Dialogflow
      console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
      response.json(responseJson);
    }
  }
}
const richResponseV2Card = {
  'title': 'Title: this is a title',
  'subtitle': 'This is an subtitle.  Text can include unicode characters including emoji 📱.',
  'imageUri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
  'buttons': [
    {
      'text': 'This is a button',
      'postback': 'https://assistant.google.com/'
    }
  ]
};
const richResponsesV2 = [
  {
    'platform': 'ACTIONS_ON_GOOGLE',
    'simple_responses': {
      'simple_responses': [
        {
          'text_to_speech': 'Spoken simple response',
          'display_text': 'Displayed simple response'
        }
      ]
    }
  },
  {
    'platform': 'ACTIONS_ON_GOOGLE',
    'basic_card': {
      'title': 'Title: this is a title',
      'subtitle': 'This is an subtitle.',
      'formatted_text': 'Body text can include unicode characters including emoji 📱.',
      'image': {
        'image_uri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png'
      },
      'buttons': [
        {
          'title': 'This is a button',
          'open_uri_action': {
            'uri': 'https://assistant.google.com/'
          }
        }
      ]
    }
  },
  {
    'platform': 'FACEBOOK',
    'card': richResponseV2Card
  },
  {
    'platform': 'SLACK',
    'card': richResponseV2Card
  }
];

var categories = ["colors", "common phrases", "fruit", "body parts"];

function CategoryUsageObj(name){
    this.name = name;
    this.usedIndexes = [];
    this.isUsedUp = function(){
        if (this.usedIndexes.length >= categoryQuestions[this.name].length)
            return true;
        else
            return false;  
    };
}

var categoryUsage = {
    "colors": new CategoryUsageObj("colors"),
    "common phrases": new CategoryUsageObj("common phrases"),
    "fruit": new CategoryUsageObj("fruit"),
    "body parts": new CategoryUsageObj("body parts")
};

var categoryQuestions = {
    "colors": [
        {"question":["azul"],"answer":["blue"]},
        {"question":["rojo"],"answer":["red"]},   
        {"question":["amarillo"],"answer":["yellow"]},
        {"question":["cafe"],"answer":["brown"]},
        {"question":["morado"],"answer":["purple"]},
        {"question":["blanco"],"answer":["white"]},
        {"question":["negro"],"answer":["black"]},
        {"question":["gris"],"answer":["gray","grey"]},
        {"question":["anaranjado"],"answer":["orange"]},
        {"question":["verde"],"answer":["green"]},
        {"question":["plateado"],"answer":["silver"]},
        {"question":["dorado"],"answer":["gold"]},
        {"question":["violeta"],"answer":["purple"]},
        {"question":["rosado"],"answer":["pink"]}
    ],
    "common phrases": [
        {"question":["por favor"],"answer":["please"]},
        {"question":["gracias"],"answer":["thanks","thank you"]},
        {"question":["bien hecho"],"answer":["well done", "good job"]},
        {"question":["buenos dias"],"answer":["good morning","good day"]},
        {"question":["buenas tardes"],"answer":["good afternoon"]},
        {"question":["buenas noches"],"answer":["good evening", "good night"]},
        {"question":["hasta luego"],"answer":["see you later","later"]},
        {"question":["lo siento"],"answer":["i'm sorry","sorry"]},
        {"question":["Por favor, habla mas despacio"],"answer":["Please, speak slower","speak slower please","please speak slower","speak slower, please"]},
        {"question":["No entiendo"],"answer":["I don't understand", "I dont understand"]},
        {"question":["Que hora es"],"answer":["What time is it"]}
    ],
    "fruit": [
  {
   "question": [
    "Albaricoque",
    "Chabacano",
    "Damasco"
   ],
   "answer": [
    "Apricot"
   ]
  },
  {
   "question": [
    "Arándano"
   ],
   "answer": [
    "Blueberry"
   ]
  },
  {
   "question": [
    "Banano"
   ],
   "answer": [
    "Banana"
   ]
  },
  {
   "question": [
    "Caimito"
   ],
   "answer": [
    "Star Apple"
   ]
  },
  {
   "question": [
    "Capulín"
   ],
   "answer": [
    "Chokecherry"
   ]
  },
  {
   "question": [
    "Cereza"
   ],
   "answer": [
    "Cherry"
   ]
  },
  {
   "question": [
    "Chirimoya"
   ],
   "answer": [
    "Cherimoya"
   ]
  },
  {
   "question": [
    "Ciruela"
   ],
   "answer": [
    "Plum"
   ]
  },
  {
   "question": [
    "Ciruela seca"
   ],
   "answer": [
    "Prune",
    "dried plum"
   ]
  },
  {
   "question": [
    "Coco"
   ],
   "answer": [
    "Coconut"
   ]
  },
  {
   "question": [
    "Dátiles"
   ],
   "answer": [
    "Dates"
   ]
  },
  {
   "question": [
    "Durazno"
   ],
   "answer": [
    "Peach"
   ]
  },
  {
   "question": [
    "Frambuesa"
   ],
   "answer": [
    "Raspberry"
   ]
  },
  {
   "question": [
    "Granada"
   ],
   "answer": [
    "Pomegranate"
   ]
  },
  {
   "question": [
    "Grenadilla",
    "Maracuyá"
   ],
   "answer": [
    "Passion fruit"
   ]
  },
  {
   "question": [
    "Guanábana"
   ],
   "answer": [
    "Soursop"
   ]
  },
  {
   "question": [
    "Guayaba"
   ],
   "answer": [
    "Guava"
    ]
  },
  {
   "question": [
    "Higos"
   ],
   "answer": [
    "Figs"
   ]
  },
  {
   "question": [
    "Lichi"
   ],
   "answer": [
    "Lychee"
   ]
  },
  {
   "question": [
    "Lima"
   ],
   "answer": [
    "Lime"
   ]
  },
  {
   "question": [
    "Limón"
   ],
   "answer": [
    "Lemon"
   ]
  },
  {
   "question": [
    "Mamey",
    "Zapote"
   ],
   "answer": [
    "Mamey Sapote"
   ]
  },
  {
   "question": [
    "Mandarina"
   ],
   "answer": [
    "Mandarin"
   ]
  },
  {
   "question": [
    "Mango"
   ],
   "answer": [
    "Mango"
   ]
  },
  {
   "question": [
    "Manzana"
   ],
   "answer": [
    "Apple"
   ]
  },
  {
   "question": [
    "Melón"
   ],
   "answer": [
    "Cantaloupe",
    "Melon"
   ]
  },
  {
   "question": [
    "Membrillo"
   ],
   "answer": [
    "Quince"
   ]
  },
  {
   "question": [
    "Mora"
   ],
   "answer": [
    "Blackberry"
   ]
  },
  {
   "question": [
    "Naranja"
   ],
   "answer": [
    "Orange"
   ]
  },
  {
   "question": [
    "Nispero"
   ],
   "answer": [
    "Loquat"
   ]
  },
  {
   "question": [
    "Papaya"
   ],
   "answer": [
    "Papaya"
   ]
  },
  {
   "question": [
    "Pasas"
   ],
   "answer": [
    "Raisins"
   ]
  },
  {
   "question": [
    "Pera"
   ],
   "answer": [
    "Pear"
   ]
  },
  {
   "question": [
    "Piña",
    "Ananá"
   ],
   "answer": [
    "Pineapple"
   ]
  },
  {
   "question": [
    "Pitahaya"
   ],
   "answer": [
    "Dragon Fruit"
   ]
  },
  {
   "question": [
    "Plátano"
   ],
   "answer": [
    "Plantain"
   ]
  },
  {
   "question": [
    "Ribes",
    "Uva-crispa"
   ],
   "answer": [
    "Gooseberry"
   ]
  },
  {
   "question": [
    "Ruibarbo"
   ],
   "answer": [
    "Rhubarb"
   ]
  },
  {
   "question": [
    "Sandia"
   ],
   "answer": [
    "Watermelon"
   ]
  },
  {
   "question": [
    "Tamarindo"
   ],
   "answer": [
    "Tamarind"
   ]
  },
  {
   "question": [
    "Toronja"
   ],
   "answer": [
    "Grapefruit"
   ]
  },
  {
   "question": [
    "Uva"
   ],
   "answer": [
    "Grape"
   ]
  }
 ],
    "body parts": [
  {
   "question": [
    "Piel"
   ],
   "answer": [
    "Skin"
   ]
  },
  {
   "question": [
    "Amígdalas"
   ],
   "answer": [
    "Tonsils"
   ]
  },
  {
   "question": [
    "Hígado"
   ],
   "answer": [
    "Liver"
   ]
  },
  {
   "question": [
    "Corazón"
   ],
   "answer": [
    "Heart"
   ]
  },
  {
   "question": [
    "Riñón"
   ],
   "answer": [
    "Kidney"
   ]
  },
  {
   "question": [
    "Estomago"
   ],
   "answer": [
    "Stomach"
   ]
  },
  {
   "question": [
    "Garganta"
   ],
   "answer": [
    "Throat"
   ]
  },
  {
   "question": [
    "Nervio"
   ],
   "answer": [
    "Nerve"
   ]
  },
  {
   "question": [
    "Intestino"
   ],
   "answer": [
    "Intestine"
   ]
  },
  {
   "question": [
    "Vesícula"
   ],
   "answer": [
    "Bladder"
   ]
  },
  {
   "question": [
    "Arteria"
   ],
   "answer": [
    "Artery"
   ]
  },
  {
   "question": [
    "Vena"
   ],
   "answer": [
    "Vein"
   ]
  },
  {
   "question": [
    "Hueso"
   ],
   "answer": [
    "Bone"
   ]
  },
  {
   "question": [
    "Costilla"
   ],
   "answer": [
    "Rib"
   ]
  },
  {
   "question": [
    "Mandíbula"
   ],
   "answer": [
    "Jaw"
   ]
  },
  {
   "question": [
    "Tendón"
   ],
   "answer": [
    "Tendon"
   ]
  },
  {
   "question": [
    "Pulmón"
   ],
   "answer": [
    "Lung"
   ]
  },
  {
   "question": [
    "Músculo"
   ],
   "answer": [
    "Muscle"
   ]
  },
  {
   "question": [
    "Cabeza"
   ],
   "answer": [
    "Head"
   ]
  },
  {
   "question": [
    "Pelo"
   ],
   "answer": [
    "Hair"
   ]
  },
  {
   "question": [
    "Cara"
   ],
   "answer": [
    "Face"
   ]
  },
  {
   "question": [
    "Ojo"
   ],
   "answer": [
    "Eye"
   ]
  },
  {
   "question": [
    "Nariz"
   ],
   "answer": [
    "Nose"
   ]
  },
  {
   "question": [
    "Boca"
   ],
   "answer": [
    "Mouth"
   ]
  },
  {
   "question": [
    "Labio"
   ],
   "answer": [
    "Lip"
   ]
  },
  {
   "question": [
    "Lengua"
   ],
   "answer": [
    "Tongue"
   ]
  },
  {
   "question": [
    "Diente"
   ],
   "answer": [
    "Tooth"
   ]
  },
  {
   "question": [
    "Oreja"
   ],
   "answer": [
    "Ear"
   ]
  },
  {
   "question": [
    "Cuello"
   ],
   "answer": [
    "Neck"
   ]
  },
  {
   "question": [
    "Hombro"
   ],
   "answer": [
    "Shoulder"
   ]
  },
  {
   "question": [
    "Brazo"
   ],
   "answer": [
    "Arm"
   ]
  },
  {
   "question": [
    "Codo"
   ],
   "answer": [
    "Elbow"
   ]
  },
  {
   "question": [
    "Muñeca"
   ],
   "answer": [
    "Wrist"
   ]
  },
  {
   "question": [
    "Mano"
   ],
   "answer": [
    "Hand"
   ]
  },
  {
   "question": [
    "Dedo"
   ],
   "answer": [
    "Finger",
    "toe"
   ]
  },
  {
   "question": [
    "Pulgar"
   ],
   "answer": [
    "Thumb"
   ]
  },
  {
   "question": [
    "Pecho"
   ],
   "answer": [
    "Chest"
   ]
  },
  {
   "question": [
    "Espalda"
   ],
   "answer": [
    "Back"
   ]
  },
  {
   "question": [
    "Cadera"
   ],
   "answer": [
    "Hip"
   ]
  },
  {
   "question": [
    "Pierna"
   ],
   "answer": [
    "Leg"
   ]
  },
  {
   "question": [
    "Rodilla"
   ],
   "answer": [
    "Knee"
   ]
  },
  {
   "question": [
    "Tobillo"
   ],
   "answer": [
    "Ankle"
   ]
  },
  {
   "question": [
    "Pie"
   ],
   "answer": [
    "Foot"
   ]
  },
  {
   "question": [
    "columna",
    "vertebral"
   ],
   "answer": [
    "spinal cord", 
    "spine"
   ]
  }
 ]
};

import log from '../lib/logger-service';
import Strings from '../../src/coaching-chatbot/strings.json';
import CommunicationMethods
 from '../../src/coaching-chatbot/communication-methods.json';

const Formatter = {
  format,
  formatFromTemplate,
  createProfile,
  getCommunicationMethods,
  matchCommunicationMethod,
};

export default Formatter;

function formatFromTemplate(template, context) {
  let s = Strings[template];

  if (Array.isArray(s)) {
    s = s[Math.floor(Math.random() * s.length)];
  }

  return format(s, context);
}

function format(template, context) {
  log.debug('Formatting template with variables {0}', JSON.stringify(context));
  let s = template;

  s = s.replace(
    /{(\w+)}/g,
    (match, name) => {
      log.silly('Formatting match {0}', match);

      if (name === 'profile') {
        return createProfile(context);
      }

      return context[name] != undefined ? context[name] : match;
    }
  );

  return s;
}

function createProfile(context) {
  return [context.name, context.job,
      context.age, context.place,
    ]
    .filter((val) => val)
    .join(', ');
}

function matchCommunicationMethod(input) {
  for(let i = 0; i < CommunicationMethods.length; i++) {
    if(CommunicationMethods[i].name === input) {
      return CommunicationMethods[i].infoRequestText;
    }
  }
}

function getCommunicationMethods( context ) {
  let communicationMethods = [];
  for (let communicationMethod of CommunicationMethods) {
    let a = (context.communicationMethods === undefined ||
        context.communicationMethods[communicationMethod.name] === undefined);
    communicationMethods.push({
        name: `${communicationMethod.name} ${a ? '' : ' (lisätty)'}`,
        payload: communicationMethod.identifier,
      });
    }
  return communicationMethods;
}

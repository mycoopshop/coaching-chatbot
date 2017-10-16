import log from '../lib/logger-service';
import * as Builder from '../chatbot/builder';
import * as Messenger from '../facebook-messenger/messenger-service';

import * as strings from './strings.json';
import PersonalInformationFormatter
 from '../lib/personal-information-formatter-service';
import CommunicationMethodsFormatter
 from '../lib/communication-methods-formatter';
import PairFormatter from '../lib/pair-formatter';
import * as Sessions from '../util/sessions-service';
import * as Pairs from '../util/pairs-service';
import AcceptedPairFormatter from '../lib/accepted-pair-formatter';
import * as Feedback from '../util/feedback-service';

import * as Chatbot from '../chatbot/chatbot-service';
import dialog from './dialog';

export function setRealName({ context, sessionId }) {
  return Messenger.getUserProfile(sessionId)
    .then((profile) => {
      const {
        first_name: firstName,
        last_name: lastName,
      } = profile;

      return Promise.resolve({
        context: {
          ...context,
          name: firstName + ' ' + lastName,
        },
      });
   });
}

export function setName({ context, input }) {
  return Promise.resolve({
    context: {
      ...context,
      name: input,
    },
  });
}

export function setRating({ context, input }) {
  return Promise.resolve({
    context: {
      ...context,
      rating: [1, 2, 3, 4].includes(Number(input)) ? Number(input) : undefined,
    },
  });
}

export function setBio({ context, input }) {
  return Promise.resolve({
    context: {
      ...context,
      bio: input,
    },
  });
}

export function updateProfile({ context, userData }) {
  let profile = PersonalInformationFormatter.createProfile(context);

  return Promise.resolve({
    userData: {
      ...userData,
      profile,
    },
  });
}

export function addCommunicationMethod({ context, input }) {
  let undefinedCommunicationInfo = 'UNDEFINED_COMMUNICATION_INFO';
  let method = CommunicationMethodsFormatter
    .getCommunicationMethodByInput(input);
  return Promise.resolve({
    context: {
      ...context,
      communicationMethods: {
        ...context.communicationMethods,
        [method.identifier]: undefinedCommunicationInfo,
      },
    },
    result: method.infoRequestText,
  });
}

export function addCommunicationInfo({ context, input }) {
  return new Promise((resolve, reject) => {
    let communicationMethods = context.communicationMethods;

    let undefinedCommunicationInfo = 'UNDEFINED_COMMUNICATION_INFO';

    for (let method in communicationMethods) {
      if (communicationMethods[method] !== undefinedCommunicationInfo) {
        continue;
      }

      return resolve({
        context: {
          ...context,
          communicationMethods: {
            ...communicationMethods,
            [method]: input,
          },
        },
      });
    }

    return resolve({
      context: {
        ...context,
        communicationMethods: {
          input,
        },
      },
    });
  });
}

export function reset() {
  return Promise.resolve({
    context: {},
  });
}

export function markUserAsSearching({ context }) {
  return Promise.resolve({
    context: {
      ...context,
      searching: true,
    },
  });
}

export function markUserAsNotSearching({ context }) {
  return Promise.resolve({
    context: {
            ...context,
            rejectedPeers: [],
            availablePeers: [],
            pairRequests: [],
            sentRequests: [],
            searching: false,
        },
  });
}

export function removeSentRequests({ sessionId, context }) {
  let sessions = new Sessions();
  const promises = [];
  if (context.sentRequests) {
    for (let requestRecipientId of context.sentRequests) {
      promises.push(
        sessions.read(requestRecipientId)
          .then((requestRecipient) => {
            let index = requestRecipient.pairRequests.indexOf(sessionId);
            if (index > -1) {
              requestRecipient.pairRequests.splice(index, 1);
              return sessions.write(requestRecipientId, requestRecipient);
            }
          }
        )
      );
    }
  }
  return Promise.all(promises)
    .then(() => context);
}

export function updateAvailablePeers({ sessionId, context }) {
  return new Promise((resolve, reject) => {
    let sessions = new Sessions();

    const rejectedPeers = context.rejectedPeers || [];

    return sessions.getAvailablePairs(sessionId)
      .then((pairs) => {
        resolve({
          context: {
            ...context,
            availablePeers: pairs
                .map((entry) => entry.id)
                .filter((entry) => rejectedPeers.indexOf(entry) < 0),
          },
        });
      })
      .catch((err) => {
        log.error('err: {0}', err);
        reject(err);
      });
  });
}

export function displayAvailablePeer({ context }) {
  return new Promise((resolve, reject) => {
    let sessions = new Sessions();

    return sessions.read(context.availablePeers[0])
      .then((profile) => {
        resolve({
          result: PairFormatter.createPairString(profile),
        });
      })
      .catch((err) => {
        log.error('err: {0}', err);
        reject(err);
      });
  });
}
export function displayAcceptedPeer({ sessionId, context }) {
  let pairs = new Pairs();
  let sessions = new Sessions();

  return pairs.read(sessionId).then((pairIds) => {
    const promises = [];

    log.silly('{0}', JSON.stringify(pairIds));
    for (let pairId of pairIds) {
      log.silly('PAIR {0}', pairId);
      promises.push(
        sessions.read(pairId).then((profile) => {
          return AcceptedPairFormatter.createPairString(profile);
        })
      );
    }

    return Promise.all(promises).then((profiles) => {
      return {
        result: profiles.join('\n'),
      };
    });
  });
}

export function nextAvailablePeer({ context }) {
  return Promise.resolve({
    context: {
      ...context,
      availablePeers: context.availablePeers.slice(1),
    },
  });
}

export function rejectAvailablePeer({ context }) {
  const rejectedPeers = context.rejectedPeers || [];
  rejectedPeers.push(context.availablePeers[0]);

  return Promise.resolve({
    context: {
      ...context,
      rejectedPeers,
    },
  });
}

export function rejectRequest({ context }) {
  const rejectedPeers = context.rejectedPeers || [];
  rejectedPeers.push(context.pairRequests[0]);

  return Promise.resolve({
    context: {
      ...context,
      rejectedPeers,
      pairRequests: context.pairRequests.slice(1),
    },
  });
}

export function acceptRequest({ sessionId, context }) {
  let pairs = new Pairs();
  let sessions = new Sessions();

  const chosenPeerId = context.pairRequests[0];
  return pairs.createPair(sessionId, chosenPeerId)
      .then(() => {
        return sessions.read(chosenPeerId)
            .then((chosenPeer) => {
              return removeSentRequests({
                sessionId: chosenPeerId, context: chosenPeer });
            })
            .then((chosenPeer) => {
              const peer = { context: { ...chosenPeer } };
              return markUserAsNotSearching(peer);
            }
          )
            .then((chosenPeer) => {
              const peer = chosenPeer.context;
              peer.state = '/?0/profile?0/accepted_pair_information?0';
              return sessions.write(chosenPeerId, peer);
            }
          );
        })
      .then(() => {
        const bot = new Chatbot(dialog, sessions);

        return bot.receive(chosenPeerId, '').then((out) => {
          // run the chatbot for the chosen peer
          let promises = [];
          for (let r of out) {
            promises.push(
              Messenger.send(chosenPeerId, r.message, r.quickReplies)
            );
          }
          return Promise.all(promises);
        });
      })
      .then(() => removeSentRequests({ sessionId, context }))
      .then(() => markUserAsNotSearching({ context }));
}

export function breakPair({ sessionId, userData, context }) {
  let pairs = new Pairs();
  let sessions = new Sessions();

  return pairs.read(sessionId)
      .then((pairList) => {
        const pairId = pairList[0];
        if (pairId === undefined) return Promise.reject();

        return pairs.breakPair(sessionId, pairId)
            .then(() => sessions.read(pairId))
            .then((context) => sessions.write(
              pairId,
              {
                ...context,
                state: '/?0/profile?0',
              }
            ))
            .then(() => {
              return Messenger.send(
                pairId,
                PersonalInformationFormatter.format(
                  strings['@NOTIFY_PAIR_BROKEN'],
                  { pairName: context.name }
                )
              );
            });
      })
      .then(() => {
        return {
          result: '@PAIR_BROKEN',
        };
      });
}

export function breakAllPairs({ sessionId }) {
  let pairs = new Pairs();
  let sessions = new Sessions();

  return pairs.read(sessionId)
    .then((pairList) => {
      const promises = [];
      for (let pairId of pairList) {
        promises.push(
          pairs.breakPair(sessionId, pairId)
            .then(() => sessions.read(pairId))
            .then((context) => sessions.write(
              pairId,
              {
                ...context,
                state: '/?0/profile?0',
              }
            ))
            .then(() => {
              return Messenger.send(
                pairId,
                PersonalInformationFormatter.format(
                  strings['@NOTIFY_PAIR_BROKEN'],
                  { pairName: context.name }
                )
              );
            })
        );
      }
      return Promise.all(promises);
    });
}

export function displayRequest({ context }) {
  return new Promise((resolve, reject) => {
    let sessions = new Sessions();

    return sessions.read(context.pairRequests[0])
      .then((profile) => {
        resolve({
          result: PairFormatter.createPairString(profile),
        });
      })
      .catch((err) => {
        log.error('err: {0}', err);
        reject(err);
      });
  });
}

export function addPairRequest({ sessionId, context }) {
  let peerId = context.availablePeers[0];
  let session = new Sessions();

  return session.read(peerId).then((chosenPeer) => {
    if (chosenPeer.searching) {
      chosenPeer.pairRequests = chosenPeer.pairRequests || [];
      chosenPeer.pairRequests.push(sessionId);
      context.sentRequests = context.sentRequests || [];
      context.sentRequests.push(peerId);

      return session.write(peerId, chosenPeer)
          .then(() => {
            return Messenger.send(
              peerId,
              strings['@TELL_USER_HAS_NEW_REQUEST'],
              Builder.QuickReplies.createArray([
                strings['@SHOW_REQUESTS'],
                strings['@STOP_SEARCHING'],
              ])
            );
          })
          .then(() => {
            return session.write(sessionId, context);
          })
          .then(() => {
            return {
              result: '@CONFIRM_NEW_PEER_ASK',
            };
          });
    } else {
      return Promise.resolve({
        result: '@PEER_NO_LONGER_AVAILABLE',
      });
    }
  });
}

export function sendRating({ context, sessionId }) {
  let pairs = new Pairs();

  const answer = strings['@RATINGS'][context.rating - 1 || 3];

  log.info('SendRating with answer ' + answer);

  return pairs.read(sessionId)
      .then((pairList) => {
        const pairId = pairList[0];
        if (pairId === undefined) return Promise.reject();

        return Messenger.send(
          pairId, strings['@TELL_USER_HAS_NEW_FEEDBACK'] + answer
        );
    }).then(() => {
      return Promise.resolve({ result: '' });
    });
}

export function sendFeedback({ context, sessionId, input }) {
  let pairs = new Pairs();
  let feedback = new Feedback();

  log.info('SendFeedback with input ' + input);

  return pairs.read(sessionId)
    .then((pairList) => {
        const pairId = pairList[0];
        if (pairId === undefined) return Promise.reject();

        return Messenger.send(pairId, input)
            .then(() => {
              return feedback.createFeedback({
                giver: sessionId, pair: pairId, feedback: input,
              });
          });
    });
}

export function setDay({ context, input }) {
  return Promise.resolve({
    context: {
      ...context,
      day: input.substring(0, 2),
    },
  });
}

export function setTime({ context, input }) {
  return Promise.resolve({
    context: {
      ...context,
      time: input,
    },
  });
}

export function testReminder({ context }) {
  console.log('test reminder action started');
  const sessions = new Sessions();
  let contexts = sessions.readAll();
  let WeekDays = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];

  const promises = [];

  for (let id of contexts) {
    const day = contexts[id].day;

    if(day === undefined) continue;

    let meetingDay = WeekDays.indexOf(day.toLowerCase());
    let curDay = new Date().getDay();
    let temp = curDay + 1;
    if (temp == 7) temp = 0;
    if (meetingDay == temp) {
      console.log('pushing message promise');
      promises.push(
          Messenger.send(id,
            strings['@REMINDER_MESSAGE'] + contexts[id].time,
          [])
      );
      console.log('promise pushed');
    }
  }
  return Promise.all(promises);
}

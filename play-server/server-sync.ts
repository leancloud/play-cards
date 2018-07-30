import {Play, Event, Region, CreateRoomFlag} from '@leancloud/play'
import * as _ from 'lodash'
import * as Promise from 'bluebird'

import Game from '../common/game'
import {RoomState, GameAction} from '../common/types'

export function statusSyncContorller(roomState: RoomState): Promise<Play> {
  return new Promise( (resolve, reject) => {
    const play = initPlay(`master-${roomState.roomId}`)
    const game = new Game(roomState.seed, roomState.players)

    play.on(Event.CONNECT_FAILED, err => {
      console.error(err)
    })

    play.once(Event.LOBBY_JOINED, () => {
      const options = {
        // 玩家离线后，保留玩家数据的时间，单位：秒
        playerTtl: 300,
        // 设置 masterClient 不自动转移
        flag: CreateRoomFlag.MasterAutoSwitch
      };

      play.createRoom({
        expectedUserIds: roomState.players,
        roomOptions: options,
      })
    })

    play.on(Event.ROOM_JOIN_FAILED, err => {
      reject(err)
    });

    play.on(Event.ROOM_JOINED, () => {
      if (play.room.getCustomProperties().gameStatus == 'running') {
        // masterClient 断线后重新加入，根据当前游戏状态继续游戏

      } else {
        game.dealCards()
        resolve(play)
        // 设置游戏已经开始的状态
        const props = {
          gameStatus: 'running',
        };
        play.room.setCustomProperties(props);
      }
    });

    play.on(Event.PLAYER_ROOM_JOINED, ({newPlayer}) => {
      play.sendEvent('gameStarted', {
        players: roomState.players
      }, {
        targetActorIds: [newPlayer.actorId]
      })

      play.sendEvent('stateChanged', {
        player: newPlayer.userId,
        state: game.getState(newPlayer.userId)
      }, {
        targetActorIds: [newPlayer.actorId]
      })
    })

    play.on(Event.CUSTOM_EVENT, ({eventId, eventData, senderId}) => {
      eventData.action = eventId
      eventData.player = play.room.getPlayer(senderId).userId
      game.performAction(eventData as GameAction)
    })

    play.on(Event.ROOM_CREATED, () => {
      // 房间创建成功
      console.log('房间名称是 ' + play.room.name);
    });

    play.on(Event.ROOM_CREATE_FAILED, (err) => {
      // TODO 可以根据 error 提示用户创建失败
      reject(err)
    });

    play.on(Event.DISCONNECTED, () => {
      // 重连并回到房间
      play.reconnectAndRejoin();
    });

    game.on('error', err => {
      console.error(err)
    })

    game.on('stateChanged', () => {
      roomState.players.map( playerName => {
        const player = _.find(play.room.playerList, {userId: playerName})

        if (player) {
          play.sendEvent('stateChanged', {
            player: playerName,
            state: game.getState(playerName)
          }, {
            targetActorIds: [player.actorId]
          })
        }
      })
    })

    play.connect()
  })
}

function initPlay(userId: string): Play {
  const play = new Play()

  play.init({
    appId: 'ITh7YgcfNOb2D86LXW06HrzT-gzGzoHsz',
    appKey: '0jFW4YaUS13HCuURs7FKnmKd',
    region: Region.NorthChina
  })

  play.userId = userId

  return play
}

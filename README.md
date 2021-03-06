# Play Cards
基于 LeanCloud 实现 **卡牌对战游戏** 的实践。目前实现了「斗地主」规则的一个子集，每局游戏有三个玩家参与，支持：单子、对子、三不带、三带一、三带二、炸弹、单顺、双顺；不支持：大小王、叫地主、抢地主、四带一、四带二、飞机。

实现方式基于 [LeanCloud Play 游戏对战](https://leancloud.cn/docs/play.html) ，服务器端会创建一个 masterClient 参与每局游戏，所有的游戏逻辑由服务端的 masterClient 来控制。

线上版本在 [play-cards.leanapp.cn](https://play-cards.leanapp.cn)。

演示视频：<https://streamable.com/belpq>。

## 项目结构

```
common              -- 公共模块（客户端、服务器共用）
├── game.ts           -- 游戏业务逻辑
└── types.ts
browser-clint       -- 客户端项目
├── app.tsx           -- 客户端入口、界面
└── client-sync.ts    -- 客户端同步逻辑
play-server         -- 服务器项目
├── server-sync.ts    -- 服务器同步逻辑
└── server.ts         -- 服务器入口、房间匹配
```

除 UI 外主要代码都在 `game.ts` 中，包括游戏规则、游戏状态、游戏动作的管理。

## 本地调试

启动项目：

```bash
npm install
npm run build
```

```bash
lean login
lean switch
lean up
```

接下来在浏览器中开三个窗口来分别模拟三个客户端。

注：如果您不清楚 lean 命令，请参考[云引擎命令行工具](https://leancloud.cn/docs/leanengine_cli.html)

## 开启日志

服务端使用以下代码启动：

```
DEBUG='Play:*' lean up
```

客户端在控制台中输入以下代码：

```
localStorage.debug = 'Play:*'
```


## 网络连接结构

![connections.png](https://github.com/leancloud/play-cards/blob/master/docs/connections.png?raw=true)

- 客户端（Browser Client）和服务器（MasterClient）都通过 WebSocket 连接到 Play Server
- 服务器负责创建房间，并在每个房间设置一个 MasterClient 参与游戏
- 客户端通过 HTTP 调用服务器来匹配并加入房间


## 数据同步

`browser-clint/client-sync.ts` 和 `play-server/server-sync.ts` 中分别是客户端和服务器的数据同步逻辑，其中的函数名一一对应。

在 statusSyncContorller 中客户端发送动作（Action），服务器运行游戏逻辑后，转发计算后的游戏状态（State），游戏逻辑主要在服务器运行，客户端只做展现，只掌握自己的手牌。

客户端的工作：

- `game.on('action')` 时，转发用户动作到服务器 `play.sendEvent(action)`
- `play.on('customEvent')` 时，应用服务器发来的游戏状态 `game.setState(state)`

服务器的工作：

- 创建一个 Room，生成 randomSeed，有新玩家加入时发送玩家列表
- `play.on('customEvent')` 时，在游戏对象上执行动作 `game.performAction(action)`
- `game.on('stateChanged')` 时，给每一个玩家发送最新的状态 `play.sendEvent(state)`

## 房间匹配

`play-server/server.ts` 中的 `POST /join` 实现了一个非常 **简易** 的自定义房间匹配，会在内存中记录请求匹配的玩家（并将请求挂起），待凑齐 3 个玩家后再给玩家响应创建好的房间名字，让客户端加入房间。

云引擎的 HTTP 连接有 60 秒的超时，所以客户端会在收到 504 的超时错误后用同一个 playerName 重试 `POST /join`。

## 断线重连
* 客户端断开重连。重新连接后 masterClient 下发游戏状态给客户端。
* masterClient 断开重连。创建房间时指定 masterClient 不自动转移，masterClient 重连后根据当前游戏状态继续游戏。

## 游戏逻辑

`common/game.ts` 中导出了一个 `Game` 类，是对游戏核心逻辑的封装，包括游戏业务逻辑（扑克的规则）和游戏状态（State）、游戏动作（Action）的管理，这个类会同时运行于客户端和服务器。

```
// 事件：action（当前玩家的动作）、stateChanged（游戏状态变化）、error
class Game extends EventEmitter {
  constructor(seed: string, players: Player[]);

  // 获取游戏状态（供 UI 调用）
  public getState(player: Player): GameState;
  // 设置游戏状态（状态同步时设置服务器发来的状态）
  public setState(player: Player, state: GameState);

  // 当前玩家执行动作
  public performAction(action: GameAction);
  // 应用其他玩家的动作（动作同步时）
  public applyAction(action: GameAction);
}
```

游戏业务逻辑，即「一组牌能否管上另一组牌」：

```
function ableToUseCards(playerCards: Card[], playingCards: Card[]): boolean {}
function ableToBeatCards(previousCards: Card[], playingCards: Card[]): boolean {}

function isSoloOrPairCards(playingCards: Card[]): boolean {}
function isTrioCards(playingCards: Card[]): boolean {}
function isChainCards(playingCards: Card[]): boolean {}
function isBomb(playingCards: Card[]): boolean {}

function ableToPlaySoloOrPairCards(previousCards: Card[], playingCards: Card[]): boolean {}
function ableToPlayTrioCards(previousCards: Card[], playingCards: Card[]): boolean {}
function ableToPlayChainCards(previousCards: Card[], playingCards: Card[]): boolean {}
function ableToPlayBomb(previousCards: Card[], playingCards: Card[]): boolean {}
```

`GameState` 是对游戏状态的描述，包括自己的手牌、每个玩家的手牌数量、前一次出牌的玩家和牌、当前轮到哪个玩家等：

```
export interface GameState {
  players: Player[]
  playersCardsCount: PlayersCardsCount

  myCards: Card[]

  previousCards: Card[]
  previousCardsPlayer?: Player
  currentPlayer?: Player

  winer?: Player
}
```

`GameAction` 是对游戏动作的描述，这个游戏中只有两种动作：出牌和放弃出牌：

```
type GameAction = PlayCardsAction | PassAction

interface PlayCardsAction {
  action: 'playCards'
  player: Player
  cards: Card[]
}

interface PassAction {
  action: 'pass'
  player: Player
}
```
var express = require('express');
var http = require('http');
var crypto = require('crypto');
var assert = require('assert');
var fb = require('fb');
var util = require('util');
var socketio = require('socket.io');
var winston = require("winston");
var redis = require('redis');
var Mongolian = require("mongolian");

winston.add(winston.transports.File, { filename: 'logs/poker.log', handleExceptions: true} );
// winston.remove(winston.transports.Console);
// winston.add(winston.transports.Console, { level : "error"});
// var log = winston;
var log = { info: function(){}, error: function(err){ console.error(err);}};


var app = express();
var server = http.createServer(app);
var io = socketio.listen(server);
io.configure(function(){
	io.set('log level', 1);
});

var client = redis.createClient();

var dbserver = new Mongolian();
var db = dbserver.db("hand_history");
var hands = db.collection("hands");


/////////////////////////////////////////////////////////////////////////////////////////////////

var players = {};
var tables = []; // the table with open seats at each level
var tableno = 0; // last table id

var roundingError = 0;	// assertion testing
var buyins = 0;			// assertion testing
var playerArray = [];	// assertion testing

/////////////////////////////////////////////////////////////////////////////////////////////////


var perm = function(array){
	var i,j,t,l;
	l = array.length;
	for (i=0; i<l-1; i++) {
		j = i+Math.floor(Math.random()*(l-i));
		t = array[i];
		array[i] = array[j];
		array[j] = t;
	}
	return array;
};

var createTable = function(data){
	var	messages = [],
		playerCount = 0,
		seat = [{},{},{},{},{},{}],
		seatOffset,
		pot = [],
		potLevel = [],
		activeSidePot,
		totalPot,
		lastAction,
		handComplete=false,
		onTheirBacks=false,
		noMoreMoney=false,
		allInSidePot = [], // seats all-in this side pot
		roundNo = 1,  // bettingRounds
		potWinnersList = [],
		collected=[0,0,0,0,0,0],
		message=[],
		betThisHand =[0,0,0,0,0,0],
		bettingLevel=2,
		firstActive,
		lastFullBet=2,
		bettingOpen=true,
		isLiveBlind=false,
		playerAction,
		amountToCall=2,
		betThisRound = [0,0,0,0,0,0],
		activeSeat=0,
		bigBlindOffset=0,
		smallBlindOffset,
		smallBlind=1,
		bigBlind=2,
		dealerOffset,
		actionAmount,
		deal,
		persist=null,
		timeout,
		input,
		session = 0, // changes on recovery to avoid message collisions
		tableid;

	var sendRestart = function(){
		for (var i=0;i<6;i++){
			if(seat[i].player ){seat[i].player.sendRestart(messages, deal);}
		}
	};


	var createDeal = function(data, end){
		var	playerCard = [],
			board = [],
			evaluation = [],
			profile = [],
			profileSuit = [],
			mask =[];

		//var random = function(depth){
		//	var i,rand;
		//	rand = [];
		//	for(i=0; i<depth; i++){
		//		rand[i] = Math.random();
		//	}
		//	return rand;
		//};

		var random = function(depth, end){
			var i=0,rand=[];
			crypto.randomBytes(depth*4, function(ex, buf){
				if (ex) {throw ex;}
				for(i=0; i<depth; i++){
					// buf is a SlowBuffer so buf.readUInt32LE() does not work.
					rand[i] = (buf[i*4]+buf[i*4+1]*256+buf[i*4+2]*256*256+buf[i*4+3]*256*256*256)/(256*256*256*256);
				}
				end(rand);
			});

		};
		var shuffle = function(depth,  end) {
			var i, deck;
			deck = [];
			for (i = 0; i < 52; i++) {
				deck[i] = i;
			}
			random(depth, function(rand){
				var t,j;
				for (i = 0; i < depth; i++) {
						// swap card at offset i with randomly chosen card from offset i
						// to end of deck
						j = i + Math.floor(rand[i] * (52 - i));
						t = deck[j];
						deck[j] = deck[i];
						deck[i] = t;
				}
				deck.length=depth;
				end(deck);
			});
		};

		//var shuffle = function(depth,  end) {
		//	var i, j, t, deck;
		//	deck = [];
		//	random(depth, function(rand){
		//		for (i = 0; i < depth; i++) {
		//				// swap card at offset i with randomly chosen card from offset i to end of deck
		//				j = i + Math.floor(rand[i] * (52 - i));
		//				t = deck[j] || j;
		//				deck[j] = deck[i] || i;
		//				deck[i] = t;
		//		}
		//		deck.length = depth;
		//		end(deck);
		//	});
		//};

		//var shuffle2 = function(depth) { // Floyd's Algorithm P
		//	var i, j, deck, rand, t;
		//	deck = [];
		//	depth = depth || 17; // hold'em with 6 players
		//	rand = random(depth);
		//	for (i = 0; i < depth; i++) {
		//		t = Math.floor(rand[i] * (52 - depth + i));
		//		for (j = 0; j < deck.length; j++) {
		//			if (deck[j] === t) {
		//				deck.splice(j, 0, 52 - depth + i);
		//				break;
		//			}
		//		}
		//		if (j === deck.length) {
		//			deck.splice(0, 0, t);
		//		}
		//	}
		//	return deck;
		//};

		var Card = function(cardNumber){
			this.cardSuit = Math.floor(cardNumber/13);
			this.cardRank = cardNumber%13;
			this.toString = function(){ return ["A","2","3","4","5","6","7","8","9","T","J","Q","K"][this.cardRank]+["s","h","d","c"][this.cardSuit]; };
		};

		var deal = function(end){
			var player, card, i;
			i=0;
			shuffle(17, function(deck){
				for (player=0; player<6; player++){
					playerCard[player] = [];
					for (card=0; card<2; card++){
						playerCard [player][card]= new Card(deck[i++]);
					}
				}
				for (card=0; card<5; card++) {
					board[card]= new Card(deck[i++]);
				}
				end();
			});
		};

		var evaluate = function(){
			var player, card, i, j, cardCount, handValue1, handValue2, hand, suits, ranks, order, highCard, flushCard, flushSuit, count, straightRank, maxMeld, maxMeldRank, secondPairRank ;
			for (player=0;player<6;player++){
				hand=[];
				suits=[];
				ranks=[];
				order=[];
				highCard=[];
				flushCard=[];


				hand[0]=board[0];
				hand[1]=board[1];
				hand[2]=board[2];
				hand[3]=board[3];
				hand[4]=board[4];
				hand[5]=playerCard[player][0];
				hand[6]=playerCard[player][1];

				suits = [0,0,0,0];
				for (i=0;i<14;i++){ranks[i]=0;}
				for (i=0;i<53;i++){order[i]=0;}
				for (i=0;i< 7;i++){highCard[i]=0;}
				for (i=0;i<13;i++){flushCard[i]=0;}

				for (card=0; card<7; card++){
					suits[hand[card].cardSuit]++;
					ranks[hand[card].cardRank]++;
					order[(hand[card].cardSuit*13)+(hand[card].cardRank)]++;
				}
				ranks[13]=ranks[0];

				maxMeld=1;
				maxMeldRank=0;
				secondPairRank=0;

				//find the biggest meld e.g.fours,trips,a pair or no pair
				for (i=13;i>0;i--){
					if (ranks[i]>maxMeld) {
						maxMeld=ranks[i];
						maxMeldRank=i;
					}
				}
				//for pairs or trips find if there is a second pair
				if (maxMeld==2 || maxMeld==3){
					for (i=13;i>0;i--){
						if (ranks[i]>1 && i!=maxMeldRank){
							secondPairRank=i;
							break;
						}
					}
				}
				//make a list of high cards of rank different from maxMeld and secondPair
				cardCount=0;
				for (i=13;i>0;i--){
					if (ranks[i]>0 && i!=maxMeldRank && i!=secondPairRank) {
						highCard[cardCount]=i;
						cardCount++;
					}
				}
				//assign values for fours,full house,trips,two pairs,pairs and no pair
				handValue1=0;
				handValue2=0;
				handProfile1=[];
				handProfile2=[];
				switch (maxMeld) {
					case 4:
						handValue1=8*0x100000 + (maxMeldRank+1)*0x10000 + (highCard[0]+1)*0x1000 ;
						handProfile1=[maxMeldRank,maxMeldRank,maxMeldRank,maxMeldRank,highCard[0]];
						break;
					case 3:
						if (secondPairRank!==0) {
							handValue1=7*0x100000 + (maxMeldRank+1)*0x10000 + (secondPairRank+1)*0x1000 ;
							handProfile1=[maxMeldRank,maxMeldRank,maxMeldRank,secondPairRank,secondPairRank];
						}
						else {
							handValue1=4*0x100000 + (maxMeldRank+1)*0x10000 + (highCard[0]+1)*0x1000 + (highCard[1]+1)*0x100;
							handProfile1=[maxMeldRank,maxMeldRank,maxMeldRank,highCard[0],highCard[1]];
						}
						break;
					case 2:
						if (secondPairRank!==0) {
							handValue1=3*0x100000 + (maxMeldRank+1)*0x10000 + (secondPairRank+1)*0x1000+ (highCard[0]+1)*0x100 ;
							handProfile1=[maxMeldRank,maxMeldRank,secondPairRank,secondPairRank,highCard[0]];
						}
						else {
							handValue1=2*0x100000 + (maxMeldRank+1)*0x10000 + (highCard[0]+1)*0x1000 + (highCard[1]+1)*0x100 + (highCard[2]+1)*0x10;
							handProfile1=[maxMeldRank,maxMeldRank,highCard[0],highCard[1],highCard[2]];
						}
						break;
					case 1:
						handValue1=1*0x100000 + (highCard[0]+1)*0x10000 + (highCard[1]+1)*0x1000 + (highCard[2]+1)*0x100 + (highCard[3]+1)*0x10 +(highCard[4]+1);
						handProfile1=[highCard[0],highCard[1],highCard[2],highCard[3],highCard[4]];
						break;
				}
				//check for flush
				flushSuit=-1;
				for (i=0;i<4;i++){
					if (suits[i]>=5){
						flushSuit=i;
					}
				}
				if (flushSuit>=0){
					// check for straight flush and evaluate
					order[(flushSuit+1)*13]=order[flushSuit*13];
					count=0;
					for (i=(flushSuit+1)*13;i>=flushSuit*13;i--){
						if (order[i]>0)
							count++;
						else
							count=0;
						if (count==5){
							handValue2 = 9*0x100000 + (i-flushSuit*13+5)*0x10000;
							straightFlushRank=i-flushSuit*13+5;
							handProfile2 = [straightFlushRank-1,straightFlushRank-2,straightFlushRank-3,straightFlushRank-4,straightFlushRank-5];
							break;
						}
					}
					if (handValue2===0){
						//evaluate flush
						count=0;
						for (i=(flushSuit+1)*13;i>=flushSuit*13;i--){
							if (order[i]>0){
								flushCard[count]=i-flushSuit*13;
								count++;
							}
						}
						handValue2 = 6*0x100000 + (flushCard[0]+1)*0x10000 + (flushCard[1]+1)*0x1000 + (flushCard[2]+1)*0x100 + (flushCard[3]+1)*0x10 + (flushCard[4]+1) ;
						handProfile2 = [flushCard[0],flushCard[1],flushCard[2],flushCard[3],flushCard[4]];
					}
				} else {
					//check for straight
					count=0;
					straightRank=0;
					for (i=13;i>=0;i--){
						if(ranks[i]>0)
							count++;
						else
							count=0;
						if (count==5) {
							straightRank=i+5;
							handValue2=5*0x100000 +straightRank*0x10000;
							handProfile2 = [straightRank-1,straightRank-2,straightRank-3,straightRank-4,straightRank-5];
							break;
						}
					}
				}
				if (handValue1>handValue2){
					evaluation[player]=handValue1;
					profile[player]=handProfile1;
					profileSuit[player]=-1;
				}
				else {
					evaluation[player]=handValue2;
					profile[player]=handProfile2;
					profileSuit[player]=flushSuit;
				}
				mask[player]=[0,0,0,0,0,0,0];

				for (i=0;i<5;i++){
					if (profile[player][i]==13) profile[player][i]=0;
					for (j=0;j<7;j++){
						if (mask[player][j]===0) {
							if (profileSuit[player]==-1){
								if (hand[j].cardRank==profile[player][i]){
									mask[player][j]=1;
									break;
								}
							}
							else {
								if (hand[j].cardRank==profile[player][i] && hand[j].cardSuit==profileSuit[player]){
									mask[player][j]=1;
									break;
								}
							}
						}
					}
				}
			}
		};

		var getHand = function(player) {
			return [playerCard[player][0],playerCard[player][1]];
		};

		var getHandValues = function() {
			return evaluation;
		};

		var getMask = function() {
			return mask;
		};

		var getProfile = function() {
			return profile;
		};

		var getProfileSuit = function() {
			return profileSuit;
		};

		var getFlop = function(){
			return [board[0],board[1],board[2]];
		};

		var getTurn = function(){
			return board[3];
		};

		var getRiver = function(){
			return board[4];
		};

		if(end){ // asynchronous random deal
			deal(function (){
				evaluate();
				for (var i = 0; i < board.length; i++) {
					board[i] = board[i].toString();
				}
				for (i = 0; i < 6; i++) {
					playerCard[i][0] = playerCard[i][0].toString();
					playerCard[i][1] = playerCard[i][1].toString();
				}
				data.seat.playerCard = playerCard;
				data.seat.board = board;
				data.seat.evaluation = evaluation;
				data.seat.profile = profile;
				data.seat.profileSuit = profileSuit;
				data.seat.mask = mask;
				end ({	getHand : getHand,
					getHandValues: getHandValues,
					getProfile : getProfile,
					getProfileSuit: getProfileSuit,
					getMask: getMask,
					getFlop: getFlop,
					getTurn: getTurn,
					getRiver: getRiver
				});
			});
		} else { // synchronous recovery
			playerCard = data.seat.playerCard;
			board = data.seat.board;
			evaluation = data.seat.evaluation;
			profile = data.seat.profile;
			profileSuit = data.seat.profileSuit;
			mask = data.seat.mask;
			return{getHand : getHand,
				getHandValues: getHandValues,
				getProfile : getProfile,
				getProfileSuit: getProfileSuit,
				getMask: getMask,
				getFlop: getFlop,
				getTurn: getTurn,
				getRiver: getRiver
			};
		}

	};

	/////////////////////////////////////////////////////////////////////////////////////////////////



		var calculateSidePots = function() {
			var allInAmount =0,
					i,
					nextAllIn,
					nextAllInAmount,
					sidePot;

			pot=[0,0,0,0,0,0];
			potLevel=[0,0,0,0,0,0];
			allInSidePot = [];

			for (sidePot=0; true ;sidePot++){

				nextAllIn =99;
				nextAllInAmount =9999999;

				//find the next all-in level and amount
				for (i=0;i<6;i++) {
					if (seat[i].player && seat[i].player.stake === 0 && betThisHand[i] > allInAmount	&& betThisHand[i] < nextAllInAmount) {
						nextAllIn = i+1;
						nextAllInAmount = betThisHand[i];
					}
				}

				potLevel[sidePot]=allInAmount;

				//compute the value of sidepot for this level
				for (i=0;i<6;i++) {
					// if (seat[i].player){
						if (betThisHand[i] > nextAllInAmount){
							pot[sidePot]+= (nextAllInAmount-allInAmount);
						} else if (betThisHand[i] >= allInAmount){
							pot[sidePot]+= (betThisHand[i]-allInAmount);
						}
					// }
				}
				//record the seatno contending for this sidepot only
				for (i=0;i<6;i++) {
					if (seat[i].player){
						if (betThisHand[i]==nextAllInAmount){
							allInSidePot[i]=sidePot;
						}
					}
				}
				activeSidePot=sidePot;
				if (nextAllIn==99) break;
				allInAmount = nextAllInAmount;
			}

			totalPot=0;
			for (i=0;i<=activeSidePot; i++) {
				totalPot+=pot[i];
			}

		};


		var sendAction=function(activeSeat){
			var action = {action:{
				position:	activeSeat,
				action:		playerAction,
				amount:	betThisRound[activeSeat-1],
				// stake:		seat[activeSeat-1].player.stake,
				pot:		pot.filter(function(a){return !!a;})
				}
			};
			if (seat[activeSeat-1].player){
				action.action.stake = seat[activeSeat-1].player.stake;
				if(seat[activeSeat-1].player.stake===0){
					action.action.allin=allInSidePot;
				}
			}
			// log.info("send action");
			message.push(action);

		};

		var sendInstruction=function(activeSeat){
			// log.info("send instruction");
			message.push({instruction:{
				position:	activeSeat,
				atc:		amountToCall,
				bl:		bettingLevel,
				lfb:		lastFullBet,
				lb:		isLiveBlind,
				bo:		bettingOpen,
				stake:		seat[activeSeat-1].player.stake
			}
			}
			);
		};

		var sendFlop=function(){
			// log.info("send flop");
			message.push({flop:deal.getFlop()});
		};

		var sendTurn=function(){
			// log.info("send turn");
			message.push({turn:deal.getTurn()});
		};

		var sendRiver=function(){
			// log.info("send river");
			message.push({river:deal.getRiver()});
		};

		var sendAdjust = function() {
			var i,topSeat=0,topCount=0,adjust=0,maxBetThisHand=0;

			if (pot[activeSidePot]===0){
				for ( i=0;i<6;i++){
					if (betThisHand[i]==potLevel[activeSidePot]) {
						topCount++;
						topSeat=i+1;
					}
				}
				if (topCount===1){
					if (seat[topSeat-1].player.stake === 0){
						allInSidePot[topSeat-1]=0;
					}
					adjust=pot[activeSidePot-1];
					seat[topSeat-1].player.stake+=adjust;
					collected[topSeat-1]+=adjust;
					for ( i=0;i<6;i++){
						if (betThisHand[i]>potLevel[activeSidePot-1]) {
							collected[i]+=potLevel[activeSidePot-1]-betThisHand[i];
							betThisHand[i]=potLevel[activeSidePot-1];
						}
					}
				}
			} else {
				for (i=0;i<6;i++){ // maxBetThisHand gets the adjust
					if (betThisHand[i] > maxBetThisHand){
						maxBetThisHand = betThisHand[i];
						topSeat=i+1;
					}
				}
				adjust=pot[activeSidePot];
				seat[topSeat-1].player.stake+=adjust;
				collected[topSeat-1]+=adjust;
				for (i=0;i<6;i++){
					if (betThisHand[i]>potLevel[activeSidePot]) {
						collected[i]+=potLevel[activeSidePot]-betThisHand[i];
						betThisHand[i]=potLevel[activeSidePot];
					}
				}
			}

			calculateSidePots();

			// log.info("send adjust");
			message.push({adjust:{
				position:topSeat,
				stake:seat[topSeat-1].player.stake,
				pot:pot.filter(function(a){return!!a;})
			}});

		};


		var showOnTheirBacks = function(){
			var i,array=[];
			for (i=0;i<6;i++){
				if (seat[i].player  && !seat[i].prefold){
					array.push({position:i+1, card1:deal.getHand(i)[0], card2:deal.getHand(i)[1]});
				}
			}
			// log.info("send show on their backs");
			message.push({show:array});
		};

		var showDown = function() {
			var array=[];
			// if(lastAction>0) show(lastAction);
			potWinnersList.forEach(function(value){
				value.seat.forEach(function(i){
					array.push({position:i+1, card1:deal.getHand(i)[0], card2:deal.getHand(i)[1]});
				});
			});
			// log.info("send showdown");
			message.push({show:array});
		};

		var splitPot = function(pW){
			var i;
			var potChips=pW.potNo.map(function(i){return pot[i];}).reduce(function(a,b){return a+b;});
			var share=Math.floor(potChips/pW.seat.length);
			var remainder=potChips%pW.seat.length;

			pW.seat.forEach(function(s,i){
				seat[s].player.stake+=(share+((i<remainder)?1:0));
				collected[s]+=(share+((i<remainder)?1:0));
			});
			for( i=0; i<6; i++){
				betThisHand[i] = 0;  // for assertion testing
			}


		};

		var payOff = function() {
			var	mask = deal.getMask(),
					i;

			potWinnersList.forEach(function(v,i){
				var payoff = {winner:[]};
				if(!persist){persist={};}
				splitPot(v);
				payoff.pot = v.potNo;
				v.seat.forEach(function(i){
					payoff.winner.push({
						position:i+1,
						amount:collected[i],
						stake:seat[i].player.stake,
						cards:mask[i].slice(5,7).join(""),
						handvalue:deal.getHandValues()[i].toString(16)
						});

					if(!handComplete){payoff.board = mask[i].slice(0,5).join("");}
					});
				// log.info("send payoff");
				message.push({payoff:payoff});
			});
			seat.forEach(function(v){
				if(v.player){
					persist[v.player.id]=JSON.stringify({chips:v.player.stake, level:(v.player.stake>0)?v.player.level:0, hsb:(v.player.stake>0)?v.player.handsSinceBlind:0});
					delete players[v.player.id].table;
					delete players[v.player.id].offset;
					players[v.player.id].stake = v.player.stake;
					players[v.player.id].handsSinceBlind = (v.player.stake>0)?v.player.handsSinceBlind:0;
				}
			});
		};

		var getWinners = function() {
			var	i,j,k,
				winners = [],  // winning hand value for each side pot
				values = deal.getHandValues();

			if (pot[activeSidePot]===0) activeSidePot--;

			//  calculate winning hand values for each side pot
			for (i=0; i<6; i++) {
				if (seat[i].player && seat[i].player.stake>0){
					if (values[i]>(winners[activeSidePot]||0)){
						winners[activeSidePot]=values[i];
					}
				}	else if (seat[i].player && seat[i].player.stake===0){
					if (values[i]>(winners[allInSidePot[i]]||0)){
						winners[allInSidePot[i]]=values[i];
					}
				}
			}

			// build pot winner list
			for (i=activeSidePot; i>=0; i--) {
				if (winners[i]<(winners[i+1]||0)){ // this pot has same winners as last so merge
					potWinnersList[potWinnersList.length-1].potNo.push(i);
					winners[i]=winners[i+1];
				} else { // add new pot
					potWinnersList.push({potNo:[i], seat:[]});
					// add all seats with this hand value that are not all-in or are all-in a later sidepot
					for (k=0;k<6;k++){
						j = (dealerOffset+1+k)%6;
						if ((values[j]===winners[i] && seat[j].player&& seat[j].player.stake===0 && allInSidePot[j]>=i) ||
							(values[j]===winners[i] && seat[j].player && seat[j].player.stake > 0))	{
							potWinnersList[potWinnersList.length-1].seat.push(j);
						}
					}
				}
			}
		};

		var getNextActive = function(previousSeat){
			var	i, countActive=0, countAllIn=0, next;

			seat.forEach(function(seat){
				if (seat.player){
					if (seat.player.stake===0){
						countAllIn++;
					} else {
						countActive++;
					}
				}
			});

			// log.info("countAllIn="+countAllIn+" countActive="+countActive);;

			if (countActive+countAllIn===1){
				handComplete=true;
				// log.info("handComplete=true");
				// log.info("activeSeat =0");
				return 0;
			}

			if (countActive<=1){
				noMoreMoney=true;
				// log.info("noMoreMoney=true");
			}

			next = 0;
			for (i=previousSeat%6+1,j=0;j<6;i=i%6+1,j++) {
				if ((seat[i-1].player && seat[i-1].player.stake>0) || seat[i-1].preFold){
					next=i;
					break;
				}
			}

			// haven't found anybody
			if (next===0){
				// log.info("haven't found anybody");
				// log.info("activeSeat =0");
				return 0;
			}

			// Adjust betting level in case BB is all-in for less than full blind and everyone has folded (or gone all in for 1) to SB
			if (next==smallBlindOffset+1){
				bettingLevel=betThisRound.reduce(function(a,b){return(a>b)?a:b;});
			}

			// Compute amountToCall and isLiveBlind for this seat
			amountToCall = bettingLevel-betThisRound[next-1];
			amountToCall = (amountToCall<0) ?0:amountToCall;  // how can it be negative?
			isLiveBlind = ((roundNo===1) && (seat[next-1].hasActed!==true) && (amountToCall===0));

			// Stop round if player has paid up and is only player remaining or has acted
			if (amountToCall===0 && (countActive===1 || seat[next-1].hasActed)){
				// log.info("player has paid up and is only player remaining or has acted");
				// log.info("activeSeat =0");
				return 0;
			}

			if ((amountToCall < lastFullBet) && seat[next-1].hasActed) {
				// log.info("bettingOpen=false");
				bettingOpen=false;
			}
			// log.info("activeSeat ="+next);
			return next;
		};

		// var dummy = function(){ // assumes callback(err, reply) is last argument
		//	if (arguments.length > 0){
		//		var callback = arguments[arguments.length-1];
		//		if (typeof callback ==='function'){
		//			process.nextTick(function(){callback(null, {});});
		//		}
		//	}
		//};

		var doProcess = function(action){
			// log.info(offset + ": " + JSON.stringify(action));
			var	i, actionString, playerString;
			offset = action.offset;
			try{

				// handle re-connection
				if(action.connect || action.reconnect){
					seat[offset].player.sendRestart(messages, deal);
					return;
				}

				if(action.session !== session){return;} // discard messages from previous sessions

				if( !deal ){ throw new Error( JSON.stringify(action) + " received before all players were seated." );}

				persist=null;

				["bet","call","check","raise","fold","sitout"].forEach(function(value){
													if(action[value]){
														playerAction=value;
														actionAmount = action[value];
													}
											});

				// check for pre-fold
				if((action.fold||action.sitout) && (offset !== activeSeat-1)){
					seat[offset].preFold=true;
					// seat[offset].player.send([{lobby:{chips:seat[offset].player.stake, level:seat[offset].player.level, ingame:action.fold?true:false}}]);
					seat[offset].player.send([{lobby:{ingame:action.fold?true:false}}]);
					if(!action.recovery){
						actionString = JSON.stringify(action);
						playerString = JSON.stringify({chips:seat[offset].player.stake, level:seat[offset].player.level, hsb:seat[offset].player.handsSinceBlind});
						log.info("HSET player" + seat[offset].player.id +": "+ playerString);
						log.info("RPUSH table:"+tableid +": "+ actionString);
						client.multi().hset("player", seat[offset].player.id, playerString)
										.rpush("table:"+tableid, actionString )
										.exec(function(err, reply){if (err){log.error(err);process.exit(1);}});
						players[seat[offset].player.id].stake = seat[offset].player.stake;  // copy to original player
						players[seat[offset].player.id].handsSinceBlind = seat[offset].player.handsSinceBlind;  // copy to original player
					}
					delete players[seat[offset].player.id].table; // delete from original
					delete players[seat[offset].player.id].offset; // delete from original
					delete seat[offset].player; // delete copy from table
					return;
				}



				// ignore unexpected input
				if	( (isLiveBlind && ["check","raise","fold","sitout"].indexOf(playerAction)>=0) ||		// check on timeout
					(!bettingOpen && ["call","fold","sitout"].indexOf(playerAction)>=0) ||			// fold on timeout
					(amountToCall===0 && ["check", "bet","fold","sitout"].indexOf(playerAction)>=0) ||	// check on timeout
					(["call","raise","fold","sitout"].indexOf(playerAction)>=0)					// fold on timeout
				// ){log.info("Expected input");}else{	throw new Error("Unexpected input");}
				){/* log.info("Expected input")*/}else{log.error("Unexpected input"); return;}

				// log.info("Clear timeout"+Number(timeout._idleStart));
				clearTimeout(timeout);

				if (action.bet) {

					if (	(actionAmount>seat[activeSeat-1].player.stake) ||
							((actionAmount<lastFullBet) &&  (actionAmount!=seat[activeSeat-1].player.stake)) )
					{	throw new Error("Invalid input: "+JSON.stringify(action));	}

					seat[activeSeat-1].player.stake -= actionAmount;
					betThisHand[activeSeat-1] += actionAmount;
					betThisRound[activeSeat-1] += actionAmount;
					bettingLevel= actionAmount;

					lastFullBet =  (actionAmount >= lastFullBet)?actionAmount:lastFullBet;
					lastAction = activeSeat;



				} else if (action.raise) {

					if (	(actionAmount+amountToCall>seat[activeSeat-1].player.stake) ||
							(actionAmount<lastFullBet) && ((amountToCall+actionAmount)!=seat[activeSeat-1].player.stake)
							){	throw new Error("Invalid input: "+JSON.stringify(action));}

					seat[activeSeat-1].player.stake -= actionAmount+amountToCall;
					betThisHand[activeSeat-1] += actionAmount+amountToCall;
					betThisRound[activeSeat-1] += actionAmount+amountToCall;
					bettingLevel += actionAmount;

					lastFullBet =  (actionAmount >= lastFullBet)?actionAmount:lastFullBet;
					lastAction=activeSeat;



				} else if (action.check) {

					if( amountToCall !== 0){throw new Error("Invalid input: "+JSON.stringify(action));}

				} else if (action.fold||action.sitout) {

					// seat[offset].player.send([{lobby:{chips:seat[offset].player.stake, level:seat[offset].player.level, ingame:(action.fold==="timeout"||action.sitout)?false:true}}]);
					seat[offset].player.send([{lobby:{ingame:(action.fold==="timeout"||action.sitout)?false:true}}]);
					persist = {};
					persist[seat[offset].player.id] = JSON.stringify({chips:seat[offset].player.stake, level:seat[offset].player.level, hsb:seat[offset].player.handsSinceBlind});
					if(!action.recovery){
						players[seat[offset].player.id].stake = seat[offset].player.stake;  // copy to original player
						players[seat[offset].player.id].handsSinceBlind = seat[offset].player.handsSinceBlind;  // copy to original player
					}
					delete players[seat[offset].player.id].table; // delete from original
					delete players[seat[offset].player.id].offset; // delete from original
					delete seat[offset].player; // delete copy


				} else if (action.call) {

					if (	(action.call>seat[activeSeat-1].player.stake) ||
							(actionAmount!=amountToCall && actionAmount!=seat[activeSeat-1].player.stake)
						// ){throw new Error("Invalid input: "+JSON.stringify(action));	}
						){log.error("Invalid input: "+JSON.stringify(action));	return;}  // ignore {call:2}{call:5} client bug

					seat[activeSeat-1].player.stake -= actionAmount;
					betThisHand[activeSeat-1] += actionAmount;
					betThisRound[activeSeat-1] += actionAmount;

				}

				seat[activeSeat-1].hasActed = true;

				calculateSidePots();

				message = [];

				sendAction(activeSeat);

				while(true){
					activeSeat = getNextActive(activeSeat);
					if (activeSeat!==0 && seat[activeSeat-1].preFold){
						seat[activeSeat-1].preFold = false;
						playerAction = "fold";
						sendAction(activeSeat);
					} else {
						break;
					}
				}

				if(activeSeat) {
					sendInstruction(activeSeat);
				} else {
					if (noMoreMoney && !onTheirBacks && !handComplete) {
						// log.info("send adjust");
						sendAdjust();
						showOnTheirBacks();
						onTheirBacks=true;
					}
					switch(roundNo) {
					case 1:	if (!handComplete) {sendFlop(); if(!onTheirBacks){break;} }
					case 2:	if (!handComplete) {sendTurn(); if(!onTheirBacks){break;} }
					case 3:	if (!handComplete) {sendRiver(); if(!onTheirBacks){break;} }
					case 4:	// log.info("Payoff");
							getWinners();
							if (!handComplete && !onTheirBacks){
								showDown();
							}
							payOff();

							message.push({lobby:{ingame:true}});
							handComplete = true; // prevents instruction from being sent after payoff
					}
					if (!handComplete && !onTheirBacks){
						roundNo +=1;
						bettingLevel = 0;
						bettingOpen=true;
						for (i=0;i<6;i++){
							betThisRound[i]=0;
							seat[i].hasActed=false;
						}
						lastFullBet = 0;
						activeSeat = dealerOffset+1;
						activeSeat = getNextActive(activeSeat);
						sendInstruction(activeSeat);
					}
				}

				if (persist && !action.recovery){
					// log.info(JSON.stringify(persist));
					actionString = JSON.stringify(action);
					log.info("HMSET player " + JSON.stringify(persist));
					log.info("RPUSH table:"+tableid + " " + actionString);
					client.multi().hmset("player", persist).rpush("table:"+tableid, actionString).exec( function(err){
						if(err){log.error(err); process.exit(1);}
						send(message, deal);

						// insert hand into mongo and remove state from redis
						if (handComplete){
							messages[10].deal=[]; //add deal cards to messages
							for (i = 0; i<6; i++){
								messages[10].deal.push({position: i+1, card1: deal.getHand(i)[0], card2:deal.getHand(i)[1]});
							}
							log.info("hand_history.hands.insert() ");
							hands.insert({hand:messages},function(err){ // mongodb hand history
								if(err){log.error(err);} else {
									log.info("LREM tables " + tableid);
									log.info("DEL table:" + tableid);
									client.multi().lrem("tables",1,tableid).del("table:"+tableid).exec();  // remove redis table
									// client.multi().lrem("tables",1,tableid).exec();  // only remove from list for debug
								}
							});
						}

					});
				} else if (!action.recovery){
					actionString = JSON.stringify(action);
					log.info("RPUSH table:"+tableid + " " + actionString);
					client.rpush("table:"+tableid, actionString, function(err){
						if(err){log.error(err);process.exit(1);}
						send(message, deal);
					});
				} else {
					send(message, deal);
					if (handComplete){ // should only get here in recovery if mongo insert has failed
						messages[10].deal=[]; //add deal cards to messages
						for (i = 0; i<6; i++){
							messages[10].deal.push({position: i+1, card1: deal.getHand(i)[0], card2:deal.getHand(i)[1]});
						}
						log.info("hand_history.hands.insert() ");
						hands.insert({hand:messages},function(err){ // mongodb hand history
							if(err){log.error(err);} else {
								log.info("LREM tables " + tableid);
								log.info("DEL table:" + tableid);
								client.multi().lrem("tables",1,tableid).del("table:"+tableid).exec();  // remove redis table
								// client.multi().lrem("tables",1,tableid).exec();  // only remove from list for debug
							}
						});
					}
				}


			// assert.equal(50*buyins, roundingError+playerArray.reduce(function(p, c){return p+c.stake*([1,2,4,8,16,32][c.level-1]);}, 0)+tables.map(function(v){ return v.reduce(function(p, c){return p+c.betThisHand.reduce(function(p, c){return p+c;}, 0);}, 0);} ).reduceRight(function(p,c){return c+2*p;},0));

			}	catch ( err ) {
				// log.error(err.name);
				// log.error(err.message);
				log.error(err.stack);
				// process.exit(1); // ignore invalid messages - re-start test
			}
		};

	var send = function(data, deal){
		var i;
		// log.info("send:"+JSON.stringify(data));
		for (i=0;i<data.length;i++){
			// data[i].time = new Date();
			messages.push(data[i]);
		}
		for (i=0; i<6; i++){
			if(seat[i].player && seat[i].player.socket){seat[i].player.send(data,deal);}
		}
		if(data[data.length-1].instruction){
			timeout = setTimeout(function(){
				log.info("--------------------------------------------------");
				log.info("Action timeout"+Number(timeout._idleStart));
				doProcess((amountToCall!==0)?{fold:'timeout',offset:activeSeat-1}:{check:'timeout',offset:activeSeat-1});
			}, 30000);
			// log.info( "Set timeout"+Number(timeout._idleStart) );
		}
	};

	var addPlayer = function(data){  // data = {seat:{id:12345,
		var	i,
			player = players[data.seat.id],
			handsSinceBlind,
			max=0,
			offset = seatOffset[playerCount++];

		var doDeal = function(){
			// big blind is longest since paying big blind
			for(i=0;i<6;i++){
				handsSinceBlind = seat[i].player.handsSinceBlind++;
				if (handsSinceBlind > max){ max=handsSinceBlind;bigBlindOffset=i;}  // should it be first or last seat?
			}
			seat[bigBlindOffset].player.handsSinceBlind = 0;

			// dealer
			dealerOffset = (bigBlindOffset+4)%6;

			// small blind
			smallBlindOffset = (bigBlindOffset+5)%6;
			betThisHand[smallBlindOffset]=smallBlind;
			betThisRound[smallBlindOffset]=smallBlind;
			seat[smallBlindOffset].player.stake-=smallBlind;

			// big blind
			bigBlind = (seat[bigBlindOffset].player.stake > 1) ? 2 : 1;
			betThisHand[bigBlindOffset]=bigBlind;
			betThisRound[bigBlindOffset]=bigBlind;
			seat[bigBlindOffset].player.stake-=bigBlind;

			// activeSeat
			activeSeat = (bigBlindOffset+1)%6+1;

			calculateSidePots();

			message = [ {seat:{position:1+offset, name:player.name, stake:player.stake}},
						{button:{position:dealerOffset+1}},
						{action:{	position:smallBlindOffset+1,
							action:"blind",
							amount:1,
							stake:seat[smallBlindOffset].player.stake,
							pot:[1]
						}
						},
						{action:{	position:bigBlindOffset+1,
							action:"blind",
							amount:bigBlind,
							stake:seat[bigBlindOffset].player.stake,
							pot:pot.filter(function(a){return !!a;})
						}
						},
						{deal:{}},
						{instruction:	{	position:activeSeat,
							atc:2,
							bl:2,
							lfb:2,
							lb:false,
							stake:seat[activeSeat-1].player.stake }
						}
						];
			var allin=[];
			if ( seat[smallBlindOffset].player.stake === 0 ){
				allin[smallBlindOffset] = 0;
				message[2].action.allin = allin;
			}
			if ( seat[bigBlindOffset].player.stake === 0 ){
				allin[bigBlindOffset] = (betThisHand[bigBlindOffset]===2?1:0);
				message[3].action.allin = allin;
			}

			if(!data.recovery){
				dataString = JSON.stringify(data);
				log.info( "RPUSH table:"+tableid + " " + dataString );
				client.rpush("table:"+tableid, dataString, function(err){
					var temp = seat[offset].player;
					delete seat[offset].player; // remove last player
					send(message,deal);
					seat[offset].player = temp; // restore last player
					// send all messages to last player
					player.send(messages, deal);
				});
			} else {
				send(message,deal);
			}
		};

		if(!data.seat.hsb){data.seat.hsb = player.handsSinceBlind;}
		if(!data.seat.stake){data.seat.stake = player.stake;}
		if (playerCount !== 6){   // single seat message to already seated players
			message =  [{seat:{position:offset+1, name:player.name, stake:player.stake}}];
			send( message );
			seat[offset].player = Object.create(player);
			player.table = this;
			player.offset = offset;
			if(!data.recovery){dataString = JSON.stringify(data);
											log.info("RPUSH table:"+ tableid + " " + dataString);
											client.rpush("table:"+tableid, dataString);
											}
			player.send(messages); // all messages to this player
		} else { // seat final player
			seat[offset].player = Object.create(player);
			player.table = this;
			player.offset = offset;
			// log.info("createTable: "+JSON.stringify({start:{level:player.level}}));
			if(!data.recovery){
				tables[player.level-1]=createTable({start:{level:player.level}}); // new table at this level
				createDeal(data, function(hand){deal = hand; doDeal();});
			} else {
				deal = createDeal(data);
				doDeal();
			}


		}
	};
	//log.info("CreateTable input:"+JSON.stringify(data));
	if(!data.start.seatOffset){data.start.seatOffset = perm([0,1,2,3,4,5]);}
	if(!data.start.time){data.start.time = new Date();}
	if(!data.start.tableid){tableid=++tableno; data.start.tableid=tableid;} else {tableid = data.start.tableid;}
	if(!data.recovery){
		var dataString = JSON.stringify(data);
		log.info("INCR tableno");
		log.info("RPUSH tables " + tableid);
		log.info("RPUSH table:" + tableid + " " + dataString);
		client.multi().incr("tableno").rpush("tables", tableid).rpush("table:"+tableid, dataString).exec();
	}
	// messages[0] = {start:{position:0, time: data.start.time, tableid:tableid}};
	session = Math.floor(1000000000*Math.random());
	messages[0] = {start:{position:0, time: data.start.time, tableid:tableid, session:session}};
	seatOffset = data.start.seatOffset;
	return {addPlayer:addPlayer, doProcess:doProcess,  betThisHand:betThisHand, messages:messages, tableid:tableid};
};

///////////////////////////////////////////////////////////////////////////////////////

var createPlayer = function(data){

	var action = function(data) {
		try {
			if(data.connect) {
				// log.info(JSON.stringify(data));
				if(data.accessToken) { // get user name
					fb.setAccessToken(data.accessToken);
					fb.api('/me', function(response) {
						// log.info(JSON.stringify(response));
						if(response.name) {
							// log.info(response.name);
							player.name = response.name.split(" ", 1)[0]; // first token from Facebook name
							var playerString = JSON.stringify({name: player.name, token: data.accessToken });
							log.info("HSET player_auth " + player.id + " " + playerString);
							client.hset("player_auth", player.id, playerString, function(err, reply) { // saving access token for possible auth caching
								if(err) {log.error(err); process.exit(1); } });
									if(player.table && (player.offset !== undefined)) { // re-connecting and still seated
										data.offset = player.offset;
										player.table.doProcess(data);
									} else {
										send([{lobby: {ingame: false } }]);
									}
								} else {
									send([{error: {description: "not authorised"} }]);
								}
							});
				} else { // robot
					player.name = "Player" + data.id;
					send([{lobby: {ingame: false } }]); // should be replaced with if(player.table etc?
				}
			} else if(data.reconnect) { // only after recovery - do not re-authenticate
				if(player.table && (player.offset !== undefined)) { // re-connecting and still seated
					data.offset = player.offset;
					log.info("Reconnecting player  " + player.id + " to table " + player.table.tableid);
					player.table.doProcess(data);
				} else {
					log.info("Reconnecting player " + player.id);
					send([{lobby: {ingame: false } }]);
				}
			} else if(data.disconnect) {
				delete players[data.id].socket;
			} else if(data.buyin) {
				// assert.equal(player.stake,0);
				// assert.equal(50*buyins, roundingError+playerArray.reduce(function(p, c){return p+c.stake*([1,2,4,8,16,32][c.level-1]);}, 0)+tables.map(function(v){ return v.reduce(function(p, c){return p+c.betThisHand.reduce(function(p, c){return p+c;}, 0);}, 0);} ).reduceRight(function(p,c){return c+2*p;},0));
				playerString = JSON.stringify({chips: 50, level: (data.id < 1000) ? data.buyin : 1, hsb: 0 });
				log.info("HSET player " + player.id + " " + playerString);
				client.hset("player", player.id, playerString, function(err, reply) { // let robot login at chosen buyin level (assumes facebook id's < 1000? )
					if(err) {
						log.error(err);
						process.exit(1);
					} else {
						player.stake = 50;
						player.level = (data.id < 1000) ? data.buyin : 1; // robots select buyin level
						buyins++; // assertion testing
						send([{lobby: {ingame: false } }]);
					}
				});
				// assert.equal(50*buyins, roundingError+playerArray.reduce(function(p, c){return p+c.stake*([1,2,4,8,16,32][c.level-1]);}, 0)+tables.map(function(v){ return v.reduce(function(p, c){return p+c.betThisHand.reduce(function(p, c){return p+c;}, 0);}, 0);} ).reduceRight(function(p,c){return c+2*p;},0));
			} else if(data.bank) {
				playerString = JSON.stringify({chips: 0, level: 0, hsb: 0 });
				log.info("HSET player " + player.id + " " + playerString);
				client.hset("player", player.id, playerString, function(err, reply) {
					if(err) {
						log.error(err);
						process.exit(1);
					} else {
						player.level = 0;
						player.stake = 0;
						player.hsb = 0;
						send([{lobby: {} }]);
					}
				});
			} else if(data.double) {
				playerString = JSON.stringify({
					chips: Math.floor(player.stake / 2),
					level: player.level + 1,
					hsb: player.handsSinceBlind
				});
				log.info("HSET player " + player.id + " " + playerString);
				client.hset("player", player.id, playerString, function(err, reply) {
					if(err) {
						log.error(err);
						process.exit(1);
					} else {
						roundingError += ((player.stake % 2) * [1, 2, 4, 8, 16, 32][player.level - 1]); // for assertion testing
						player.stake = Math.floor(player.stake / 2);
						player.level++;
						send([{lobby: {ingame: false } }]); }
				});
			} else if(data.play) {
				if(player.table) {
					log.error("Cannot seat player twice:"+JSON.stringify(data));
				} else {
					tables[player.level - 1].addPlayer({seat: {id: player.id } });
				}
			} else if(player.table && (player.offset !== undefined)) {
				data.offset = player.offset;
				player.table.doProcess(data);
			}
		} catch(err) {
			log.error(err.stack);
		}
	};

	var personalise= function(data, deal) {
		var j;
		for (j=0;j<data.length;j++){
			if (data[j].deal && deal){data[j].deal.card1 = deal.getHand(player.offset)[0]; data[j].deal.card2 = deal.getHand(player.offset)[1];}
			if (data[j].start){data[j].start.position = player.offset+1;}
			if (data[j].lobby){
				data[j].lobby.chips = player.stake;
				data[j].lobby.level = player.level;
			}
		}
	};

	var depersonalise= function(data) {
		var j;
		for (j=0;j<data.length;j++){
			if (data[j].deal){delete data[j].deal.card1; delete data[j].deal.card2;}
			if (data[j].start){delete data[j].start.position;}
			if (data[j].lobby){
				delete data[j].lobby.chips;
				delete data[j].lobby.level;
			}
		}
	};

	var send = function(data, deal){
		if(player.socket){
			personalise(data, deal);
			data.unshift(player.id);
			player.socket.emit("message", data);
			log.info("Player"+player.id+": "+JSON.stringify(data));
			data.shift();
			depersonalise(data);
		}
	};

	var sendRestart = function(data, deal){
		var message;
		if (player.offset !== undefined){
			personalise(data, deal);
			message = [player.id,{restart:data},data[data.length-1]];
			player.socket.emit("message", message);	// replay last instruction with animation
			log.info("Player"+player.id+": "+JSON.stringify(message));
			depersonalise(data);
		}
	};

	var player =  {
			// socket:socket,
			action:action,
			name: (data.id < 1000)? "Player"+data.id : undefined,  // name a robot
			id: data.id,
			send:send,
			stake: data.chips,
			handsSinceBlind: data.hsb,
			level: data.level,
			sendRestart:sendRestart
	};

	//client.hget("player", player.id, function(err, result){
	//	if(err||result===null){
	//		player.stake=0;
	//		player.level=0;
	//		player.handsSinceBlind = 0;
	//	}else{
	//		log.info(JSON.stringify(result));
	//		result = JSON.parse(result);
	//		player.stake = result.chips;
	//		player.level = result.level;
	//		player.handsSinceBlind = result.hsb;
	//	}
	//	end(player);
	//});
	// log.info("player  id:"+player.id+" stake:"+player.stake+" handsSinceBlind:"+player.handsSinceBlind+ " level:"+player.level);
	return player;

};

////////////////////////////////////////////////////////////////////////////

var connect = function(socket, end){
	log.info("--------------------------------------------------");
	log.info("connect:" + socket.id);
	for (var i in players){
		action(socket,{reconnect:true, id:i});
	}
};

var action = function(socket, data){
	log.info("--------------------------------------------------");
	log.info("action: " + JSON.stringify(data));
	if(!players[data.id]){
		client.hget("player", data.id, function(err, result){
			if(err||result===null){
					data.chips = 0;
					data.level = 0;
					data.hsb = 0;
				// client.hset("player",data.id, JSON.stringify(data.record));
			}else{
				var record = JSON.parse(result);
				data.chips = record.chips;
				data.level = record.level;
				data.hsb = record.hsb;
			}
			players[data.id] = createPlayer(data);
			players[data.id].socket = socket;
			players[data.id].action(data);
		});
	} else {
		if(data.connect || data.reconnect){players[data.id].socket = socket;} // re-connection
		players[data.id].action(data);
	}
};

var disconnect = function(socket){
	log.info("--------------------------------------------------");
	log.info(" disconnect" + socket.id);
};

////////////////////////////////////////////////////////////////////////////

//recover players
var recoverPlayers = function(end) {
	client.hgetall("player", function(err, response){
		if(err){
			log.error(err);
			end(err);
		} else {
			for (var id in response){
				if(response.hasOwnProperty(id)){
					// log.info("Creating player "+id);
					var data = JSON.parse(response[id]);
					data.id = id;
					players[id]=createPlayer(data);
				}
			}
			client.hgetall("player_auth", function(err,response){
				if(err){
					log.error(err);
					end(err);
				} else {
					for (var id in response){
						if(response.hasOwnProperty(id)){
							// log.info("Naming player "+id);
							var auth = JSON.parse(response[id]);
							// log.info(response[id]);
							if( players[id]){
								players[id].name = auth.name;
								players[id].token = auth.token;
							}
						}
					}
					if(end){end();}
				}
			});
		}
	});
};

// recover tables
var recoverTables = function(end){
	var i,j,level;
	var handleResponse = function(err,input){
		if(err){log.error(err);process.exit(1);}
		//log.info("Reading table: "+input);
		var data = input.map(JSON.parse);
		for (j = 0;j<data.length;j++){
			data[j].recovery = true;
			if (data[j].start){
				level = data[j].start.level;
				log.info("createTable:"+JSON.stringify(data[j]));
				tables[level-1]=createTable(data[j]);
			} else if (data[j].seat){
				log.info("addPlayer:"+JSON.stringify(data[j]));
				tables[level-1].addPlayer(data[j]);
			} else {
				log.info("doProcess:"+JSON.stringify(data[j]));
				tables[level-1].doProcess(data[j]);
			}
			// log.info(JSON.stringify(tables[level-1].messages));
		}
		left--;
		if(end && !left){end();}
	};
	log.info("Reading table list");
	client.get("tableno", function(err, response){
		if(err){log.error(err);process.exit(1);}
		if(response){
			tableno=response;
			log.info("tableno is:"+tableno);
			client.lrange("tables", 0, -1, function(err, response){
				if(err){log.error(err);process.exit(1);}
				log.info(JSON.stringify(response));
				left = response.length;
				for (i=0;i<response.length;i++){
					client.lrange("table:"+response[i], 0, -1, handleResponse);
				}
			});
		} else {
			log.info("Starting empty tables at levels 1 2 3 4 5 6");
			for (i=0;i<6;i++){  // 6 levels
				tables[i]=createTable({start:{level:i+1}});
			}
			if(end){end();}
		}
	});
};

////////////////////////////////////////////////////////////////////////////

log.info("==================================================");

recoverPlayers(function(err){
	if(err){log.error(err); process.exit();}
	recoverTables(function(err){
		if(err){log.error(err); process.exit(1);}
			log.info("Start listening");
			server.listen(1338);

			app.configure(function(){
				app.use(express.static(__dirname)); // not used?
			});

			io.sockets.on('connection', function(socket) {
				connect(socket);
				socket.on('action', function(data) {action(socket, data);});
				socket.on('disconnect', function(){ disconnect(socket);});
			});
			// publish restart event
			//	client.publish("poker_event", JSON.stringify({"restart":"poker:1"}));
	});
});

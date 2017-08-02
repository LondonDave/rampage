var io = require("socket.io/node_modules/socket.io-client");
var util = require('util');
var winston = require("winston");
winston.add(winston.transports.File, { filename: 'logs/robot.log', handleExceptions: true });
// winston.remove(winston.transports.Console);
// winston.add(winston.transports.Console, { level : "error"});
// var log = winston;
var log = { info: function(){}, error: function(err){ console.error(err);}};


var makeBot = function(buyinlevel){

////////////////////////////////////////////////  RULES  //////////////////////////////////////////////////////////
	// HAND GROUP
	var GROUP=[
	"AA KK",
	"QQ AKs AKo",
	"JJ",
	"TT",
	"AQs AQo 99",
	"AJs AJo ATs ATo KQs KQo 88 77",
	"A9s A9o A8s A8o 66 55 44 KQs KQo",
	"A7s A7o A6s A6o A5s A5o A4s A4o A3s A3o A2s A2o 33 22 KJs KJo KTs KTo",
	"QJs QJo QTs QTo JTs JTo K9s K9o K8s K8o",
	"K7s K7o K6s K6o K5s K5o K4s K4o K3s K3o K2s K2o Q9s Q9o Q8s Q8o Q7s Q7o Q6s Q6o Q5s Q4s Q3s Q2s J9s J9o T9s T9o 98s 87s 76s 65s 54s",
	"Q5o Q4o Q3o Q2o J8s J7s J6s J5s J4s J3s J2s J8o J7o 97s T8s"
	];

	// SITUATION
	var FTA_SB			=0;		// In the small blind, no limpers or raisers
	var FTA_BUTTON		=1;		// On the button, no limpers or raisers
	var SB_LIMP			=2;		// In the big blind, the small blind has limped, no other limpers
	var FTA_CUTOFF		=3;		// In the cut-off (one seat before the button), no limpers or raisers
	var BUTTON_LIMP		=4;		// In the blinds when the button has limped (including BB when SB and button both limp)
	var FTA_OTHER		=5;		// In any other position, no limpers or raisers
	var LIMPERS			=6;		// In any position, there are limper(s) but no raisers
	var SB_RAISE		=7;		// In the BB with no limpers and the SB has raised
	var WEAK_RAISE		=8;		// In the blinds, the button has raised and no one else is in the pot
	var STRONG_RAISE	=9;		// Any other scenario where there has been a raise (including button or SB raise after limper(s))
	var RERAISE			=10;	// Where there has been a reraise
	var RAISE_RERAISE	=11;	// Where my bet has been reraised

	// STACK SIZE
	var LARGE		=0;	// >21 SBs
	var MODERATE	=1;	// >16 SBs, <=21 SBs
	var SHORTISH	=2;	// >13 SBs, <=16 SBs
	var SHORT		=3;	// >9  SBs, <=13 SBs
	var V_SHORT		=4;	// >6  SBs, <=9  SBs
	var CRIPPLED	=5;	// <=6 SBs

	// HAND REQUIREMENTS FOR SITUATION AND STACK  ( group12=any  group0=n/a )
	var GROUP_REQUIRED= [
		[4,5,10,12,12,11],
		[6,6,8,11,11,11],
		[4,4,8,11,11,11],
		[6,6,7,9,11,11],
		[4,4,7,9,11,11],
		[5,5,6,7,11,11],
		[6,6,6,6,9,11],
		[4,4,5,6,9,11],
		[4,4,5,5,6,9],
		[4,4,4,4,5,8],
		[1,1,1,1,1,1],
		[0,0,0,0,0,0]
	];
//////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////  TABLE DETAILS AND ANALYSIS //////////////////////////////////
	var offset;
	var buttonoffset;
	var seats;
	var roundNo;
	var startRoundPlayers;
	var cards;
	var board;
	var pot;
	var raised;
	var raiser;
	var numLimpers;
	var reraised=false;
	var raiseCalled=false;
	var preflopraised=false;
	var session = 0;

	var reset = function(){
		offset=0;
		buttonoffset=0;
		startRoundPlayers=0;
		seats = [];
		cards=[];
		board=[];
		pot=[];
		raised=false;
		raiser=-1;
		numLimpers=0;
		reraised=false;
		raiseCalled=false;
		preflopraised=false;
	};

	var potTotal = function(){
		var total=0;
		for(var i in pot) { total += pot[i]; }
		return total;
	};

	var toButton=function(offset,buttonoffset){
		var position=buttonoffset-offset;
		if (position<0) position=6+position;
		return position;
	};

	var nextRound=function(round){
		roundNo=round;
		var seat;
		for (seat in seats){
			seat.brh+=seat.btr;
			seat.btr=0;
		}
		if (round==2) preflopraised=raised;
		startRoundPlayers=getActivePlayers();
		raised=false;
		raiser=-1;
		numLimpers=0;
		reraised=false;
		raiseCalled=false;
	};

	var getHandType=function(cards){
		var r1="  23456789TJQKA".indexOf(cards[0].charAt(0));
		var r2="  23456789TJQKA".indexOf(cards[1].charAt(0));
		if (r1==r2) return   cards[0].charAt(0)+cards[1].charAt(0);
		var suited='o';
		if (cards[0].charAt(1)==cards[1].charAt(1)) suited='s';
		if (r1>r2) return cards[0].charAt(0)+cards[1].charAt(0)+suited;
		else return cards[1].charAt(0)+cards[0].charAt(0)+suited;
	};

	var getGroup=function(cards){
		var type=getHandType(cards);
		for (var i=0; i<GROUP.length;i++ ){
			if (GROUP[i].indexOf(type)>-1) return i+1;
		}
		return GROUP.length+1;
	};

	var getMaxActiveStack=function() {
		var stack=0;
		for (var i=0; i<seats.length; i++) {
			if (seats[i].status=="active" && i!=offset && (seats[i].stake+seats[i].bth+seats[i].btr)>stack){
				stack=seats[i].stake+seats[i].bth+seats[i].btr;
			}
		}
		return stack;
	};

	var getStackSize=function() {
		var stackSize=seats[offset].stake+seats[offset].bth+seats[offset].btr;
		var maxActive=getMaxActiveStack();
		if (stackSize>maxActive) stackSize=maxActive;

		if      (stackSize>21)       return LARGE;
		else if (stackSize>16)       return MODERATE;
		else if (stackSize>13)       return SHORTISH;
		else if (stackSize> 9)        return SHORT;
		else if (stackSize> 6)        return V_SHORT;
		else                                   return CRIPPLED;
	};

	var getSituation=function() {
		pos=toButton(offset,buttonoffset);
		if (!raised){  // UNRAISED
			if (numLimpers===0) {  // NO LIMPERS
				if (pos==5)             return  FTA_SB;
				else if (pos===0)    return  FTA_BUTTON;
				else if (pos==1)    return  FTA_CUTOFF;
				else                        return      FTA_OTHER;
			}
			else {  // LIMPERS
				if          (pos==4 && numLimpers==1 && seats[(buttonoffset+1)%6].status=="active")     return SB_LIMP;
				else if     (pos==5 && numLimpers==1 && seats[buttonoffset].status=="active")       return BUTTON_LIMP;
				else if     (pos==4 && numLimpers==1 && seats[buttonoffset].status=="active")       return BUTTON_LIMP;
				else if     (pos==4 && numLimpers==2 && seats[buttonoffset].status=="active" && seats[(buttonoffset+1)%6].status=="active")         return BUTTON_LIMP;
				else        return LIMPERS;
			}
		}
		else {  // RAISED
			if (!reraised && !raiseCalled && numLimpers===0) {
				if (raiser==((buttonoffset+1)%6))       return SB_RAISE;
				else if (raiser==buttonoffset)              return WEAK_RAISE;
				else                                                        return STRONG_RAISE;
			}
			else if (reraised){ // RERAISED
				if (raiser==offset)         return  RAISE_RERAISE;
				else                                return  RERAISE;
			}
			else return STRONG_RAISE;
		}
	};

	var decidePlay=function(s) {
//      log.info(util.inspect(s));
		var outs, probBest, singleProb, fullProb;
		if (roundNo==1) {
			//document.write("Situation "+getSituation() + " StackSize "+getStackSize() +" Group "+getGroup(cards)+" Required "+GROUP_REQUIRED[getSituation()][getStackSize()]+"<br>");
			var myGroup=getGroup(cards);
			if (myGroup<=GROUP_REQUIRED[getSituation()][getStackSize()]) return raise(s);
			if (!raised && numLimpers>=2 && myGroup<=8) return checkCall(s);
			if (reraised && (raiser==offset)) {
				var stakeRatio=s.stake/s.btr;
				if (stakeRatio<=2) return raise(s);
				else if (myGroup<=5 && stakeRatio<=3 ) return raise(s);
				else if (myGroup<=3 && stakeRatio<=4 ) return raise(s);
				else if (myGroup<=2) return raise(s);
			}
			if (raised && !raiseCalled && !reraised && numLimpers===0){
				pos=toButton(offset,buttonoffset);
				if (pos==4){
					if (getMaxActiveStack()<=5) return raise(s);
					if (getMaxActiveStack()<=7 && myGroup<=10) return raise(s);
				}
			}
			return checkFold(s);
		}
		else if (roundNo==2)  {
			//document.write("<br>"+JSON.stringify(board.concat(cards))+"<br>");
			//document.write(evaluate(board.concat(cards)).toString(16)+"<br>");
			//document.write(getOuts()+"<br>");
			//document.write(probBestHand()+"<br>");

			//return randomPlay(s); // during construction
			outs=getOuts();
			probBest=probBestHand(preflopraised);
			if (probBest>70) outs=0;
			probBest=adjustedProbBest(startRoundPlayers-1,probBest);

			singleProb=0;
			fullProb=0;
			singleProb=outs/47.0;
			fullProb=1-((47-outs)/47.0)*((46-outs)/46.0);

			if (preflopraised) {
				if (!raised) {
					if (probBest>45) return raise(s);
					else if (fullProb>=0.25 && getActivePlayers()==3) return raise(s);
				}
				else if (raised && !reraised) {
					if (probBest>75) return raise(s);
					else if (1/(getFinalPotOdds(s)+1)<=fullProb)  return raise(s);
					else if (1/(getPotOdds(s)+1)<=singleProb) return checkCall(s);
				}
				else if (reraised && raiser==offset) {
					if (probBest>75) return raise(s);
					else if (1/(getFinalPotOdds(s)+1)<=fullProb)  return raise(s);
					else if (1/(getPotOdds(s)+1)<=singleProb) return checkCall(s);
				}
				else if (reraised && raiser!=offset) {
					if (probBest>85) return raise(s);
					else if (fullProb>=0.3)  return raise(s);
				}
			}
			else if (!preflopraised) {
				if (!raised) {
					if (probBest>50) return raise(s);
				}
				else if (raised && !reraised) {
					if (probBest>65) return raise(s);
					else if (1/(getFinalPotOdds(s)+1)<=fullProb)  return raise(s);
					else if (1/(getPotOdds(s)+1)<=singleProb) return checkCall(s);
				}
				else if (reraised && raiser==offset) {
					if (probBest>75) return raise(s);
					else if (1/(getFinalPotOdds(s)+1)<=fullProb)  return raise(s);
					else if (1/(getPotOdds(s)+1)<=singleProb) return checkCall(s);
				}
				else if (reraised && raiser!=offset) {
					if (probBest>85) return raise(s);
					else if (fullProb>=0.3)  return raise(s);
				}
			}
			return checkFold(s);
		}
		else if (roundNo==3) {
			outs=getOuts();
			probBest=probBestHand(preflopraised);
			if (probBest>70) outs=0;
			probBest=adjustedProbBest(startRoundPlayers-1,probBest);

			singleProb=outs/46.0;

			if (!raised) {
				if (probBest>75) return raise(s);
			}
			else if (raised) {
				if (probBest>85) return raise(s);
				else if (1/(getFinalPotOdds(s)+1)<=singleProb)  return raise(s);
				else if (1/(getPotOdds(s)+1)<=singleProb) return checkCall(s);
			}
			return checkFold(s);
		}
		else if (roundNo==4) {
			probBest=probBestHand(preflopraised);
			probBest=adjustedProbBest(startRoundPlayers-1,probBest);

			if (!raised)
			{
				if (probBest>75) return raise(s);
			}
			else if (raised)
			{
				if (probBest>85) return raise(s);
				else if (probBest>65) return checkCall(s);
			}
			return checkFold(s);
		}
	};

	var inHand=function(nextCard,hand){
		for (var x in hand){
			if (nextCard==hand[x]) return true;
		}
		return false;
	};

	var getOuts=function(){
		var probCallerList;
		var probCallerListRaised="QQ JJ TT 99 88 77 66 AKs AKo AQs AQo AJs AJo ATs ATo A9s A8s KQs KJs QJs";
		var probCallerListUnraised="88 77 66 AJo ATs ATo A9s A8s KQs KJs QJs KTs QTs 55 44 33 22 A7s A6s A5s A4s A3s A2s JTs T9s 98s 87s 76s 65s KQo KJo KTo QJo QTo JTo A9o A8o A7o   A6o A5o A4o A3o A2o K9s K9o K8s K8o K7s K7o K6s K5s K4s K3s K2s Q9s Q8s Q7s Q6s Q5s Q4s Q3s Q2s Q9o Q8o J9s J9o 45s T8s 97s 86s 75s 64s";
		if (preflopraised) probCallerList=probCallerListRaised;
		else probCallerList=probCallerListUnraised;

		var card1,card2,nextCard;
		var outs=0;

		if (roundNo==4) return outs;

		for (var n=0; n<52; n++) {
			nextCard="23456789TJQKA".substring(Math.floor(n/4),Math.floor(n/4)+1)+"cdhs".substring(n%4,(n%4)+1);
			var myHand=cards.concat(board);
			if (inHand(nextCard,myHand)) continue;
			var hand=myHand.concat(nextCard);
			var handValue=evaluate(hand);
			var losers=0;
			var winners=0;

			for (var i=0; i<51; i++) {
				card1="23456789TJQKA".substring(Math.floor(i/4),Math.floor(i/4)+1)+"cdhs".substring(i%4,(i%4)+1);
				if (inHand(card1,hand)) continue;

				for (var j=i+1; j<52; j++) {
					card2="23456789TJQKA".substring(Math.floor(j/4),Math.floor(j/4)+1)+"cdhs".substring(j%4,(j%4)+1);
					if (inHand(card2,hand)) continue;
					var opponentCards=[];
					opponentCards[0]=card1;
					opponentCards[1]=card2;
					if (probCallerList.indexOf(getHandType(opponentCards))>=0) {
						var opponentHand= opponentCards.concat(board,nextCard);
						var opponentHandValue=evaluate(opponentHand);
						if (opponentHandValue>handValue) winners++;
						else losers ++;
					}
				}
			}
			if( (winners+losers)>0 && (100.0*losers)/(winners+losers)>80) {
				outs++;
			}
		}
		return outs;
	};

	var probBestHand=function() {
		var probCallerList;
		var probCallerListRaised="QQ JJ TT 99 88 77 66 AKs AKo AQs AQo AJs AJo ATs ATo A9s A8s KQs KJs QJs";
		var probCallerListUnraised="88 77 66 AJo ATs ATo A9s A8s KQs KJs QJs KTs QTs 55 44 33 22 A7s A6s A5s A4s A3s A2s JTs T9s 98s 87s 76s 65s KQo KJo KTo QJo QTo JTo A9o A8o A7o   A6o A5o A4o A3o A2o K9s K9o K8s K8o K7s K7o K6s K5s K4s K3s K2s Q9s Q8s Q7s Q6s Q5s Q4s Q3s Q2s Q9o Q8o J9s J9o 45s T8s 97s 86s 75s 64s";
		if (preflopraised) probCallerList=probCallerListRaised;
		else probCallerList=probCallerListUnraised;

		var card1,card2;

		var myHand=cards.concat(board);
		var handValue=evaluate(myHand);
		var losers=0;
		var winners=0;

		for (var i=0; i<52; i++) {
			card1="23456789TJQKA".substring(Math.floor(i/4),Math.floor(i/4)+1)+"cdhs".substring(i%4,(i%4)+1);
			if (inHand(card1,myHand)) continue;

			for (var j=i+1; j<52; j++) {
				card2="23456789TJQKA".substring(Math.floor(j/4),Math.floor(j/4)+1)+"cdhs".substring(j%4,(j%4)+1);
				if (inHand(card2,myHand)) continue;
				var opponentCards=[];
				opponentCards[0]=card1;
				opponentCards[1]=card2;
				if (probCallerList.indexOf(getHandType(opponentCards))>=0) {
					var opponentHand= opponentCards.concat(board);
					var opponentHandValue=evaluate(opponentHand);
					if (opponentHandValue>handValue) winners++;
					else losers ++;
				}
			}
		}
		return (100.0*losers)/(winners+losers);
	};

	var  adjustedProbBest=function(noOfOpponents, probBestHeadsup) {
		var p=100;
		for (var i=1; i<=noOfOpponents; i++) {
			p=(p*probBestHeadsup)/100;
		}
		return p;
	};

	var getFinalPotOdds=function(s) {
//      return (getEligiblePot()+Math.max(seats[offset].stake+seats[offset].btr-s.bl,0))/stake;
		return (getEligiblePot()+Math.max(seats[offset].stake+seats[offset].btr-s.bl,0))/s.stake;
	};

	var getPotOdds=function(s) {
		return getEligiblePot()/(Math.min(s.bl,seats[offset].stake+seats[offset].btr)-seats[offset].btr);
	};

	var getEligiblePot=function() {
		var pot=0;
		for (var i=0; i<6; i++) {
			pot+=Math.min(seats[i].btr+seats[i].bth,seats[offset].btr+seats[offset].bth+seats[offset].stake);
		}
		return pot;
	};

	var getActivePlayers=function() {
		var p=0;
		for (var i=0; i<6; i++) {
			if (seats[i].status=="active") p++;
		}
		return p;
	};

	var evaluate=function (hand) {
		var evaluation;
		var suits=[0,0,0,0];
		var ranks=[0,0,0,0,0,0,0,0,0,0,0,0,0,0];
		var order=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
		var highCard=[0,0,0,0,0];
		var flushCard=[0,0,0,0,0,0,0,0,0,0,0,0,0];

	for (var c in hand){
		var rank="A23456789TJQK".indexOf(hand[c].charAt(0));
		var suit="cdhs".indexOf(hand[c].charAt(1));
		suits[suit]++;
		ranks[rank]++;
		order[rank*suit]++;
	}
	ranks[13]=ranks[0];

	var maxMeld=1;
	var maxMeldRank=0;
	var secondPairRank=0;

	//find the biggest meld e.g.fours,trips,a pair or no pair
	for (var i=13;i>0;i--){
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
	var cardCount=0;
	for (i=13;i>0;i--){
		if (ranks[i]>0 && i!=maxMeldRank && i!=secondPairRank) {
			highCard[cardCount]=i;
			cardCount++;
		}
	}
	//assign values for fours,full house,trips,two pairs,pairs and no pair
	var handValue1=0;
	var handValue2=0;
	switch (maxMeld) {
		case 4:
			handValue1=8*0x100000 + (maxMeldRank+1)*0x10000 + (highCard[0]+1)*0x1000 ;
			break;
		case 3:
			if (secondPairRank!==0)
				handValue1=7*0x100000 + (maxMeldRank+1)*0x10000 + (secondPairRank+1)*0x1000 ;
			else
				handValue1=4*0x100000 + (maxMeldRank+1)*0x10000 + (highCard[0]+1)*0x1000 + (highCard[1]+1)*0x100;
			break;
		case 2:
			if (secondPairRank!==0)
				handValue1=3*0x100000 + (maxMeldRank+1)*0x10000 + (secondPairRank+1)*0x1000+ (highCard[0]+1)*0x100 ;
			else
				handValue1=2*0x100000 + (maxMeldRank+1)*0x10000 + (highCard[0]+1)*0x1000 + (highCard[1]+1)*0x100 + (highCard[2]+1)*0x10;
			break;
		case 1:
			handValue1=1*0x100000 + (highCard[0]+1)*0x10000 + (highCard[1]+1)*0x1000 + (highCard[2]+1)*0x100 + (highCard[3]+1)*0x10 +(highCard[4]+1);
			break;
	}
	//check for flush
	var flushSuit=-1;
	for (i=0;i<4;i++){
		if (suits[i]>=5){
			flushSuit=i;
		}
	}
	var count = 0;
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
		}
		}
		else {
		//check for straight
		count=0;
		var straightRank=0;
		for (i=13;i>=0;i--){
			if(ranks[i]>0)
				count++;
			else
				count=0;
			if (count==5) {
				straightRank=i+5;
				handValue2=5*0x100000 +straightRank*0x10000;
				break;
			}
		}
		}
		if (handValue1>handValue2){
			evaluation=handValue1;
		}else {
			evaluation=handValue2;
		}
		return evaluation;
	};

	var randomPlay=function(s){
		var p=potTotal();
		var r=Math.floor(Math.random()*10);
		var c;
		if (s.lb) {
			if (r<=8) return {check: "button", position: offset+1};
			else {
				if (p>s.stake) return {raise: s.stake, position: offset+1};
				else return {raise: p+s.atc, position: offset+1};
			}
		}
		else if (s.bo===false) {
			if (r<=6) return {fold: "button", position: offset+1};
			else {
				c=Math.min(s.atc,s.stake);
				return {call: c, position: offset+1};
			}
		}
		else if (s.atc===0) {
			if (r<=8) return {check: "button", position: offset+1};
			else {
				if (p>s.stake) return {bet: s.stake, position: offset+1};
				else return {bet: p, position: offset+1};
			}
		}
		else {
			if (r<=6) return {fold: "button", position: offset+1};
			else if (r<=8) {
				c=Math.min(s.atc,s.stake);
				return {call: c, position: offset+1};
			}
			else {
				if (s.atc>=s.stake) return  {call: s.stake, position: offset+1};
				if (p+s.atc>s.stake-s.atc) return {raise: s.stake-s.atc, position: offset+1};
				else return {raise: p+s.atc, position: offset+1};
			}
		}
	};

	var raise=function(s) {
		//document.write("bth "+seats[offset].bth + " btr "+seats[offset].btr +" pot "+potTotal()+" atc "+s.atc+" stake "+s.stake+"<br>");
		if (seats[offset].bth+seats[offset].btr+potTotal()+s.atc+s.atc>(seats[offset].bth+seats[offset].btr+s.stake)*0.4) return raiseAllin(s);
		else return raisePot(s);
	};

	var raisePot=function(s) {
		var p=potTotal();
		if (s.lb) {
			if (p>s.stake) return {raise: s.stake, position: offset+1};
			else return {raise: p+s.atc, position: offset+1};
		}
		else if (s.bo===false) {
			var c=Math.min(s.atc,s.stake);
			return {call: c, position: offset+1};
		}
		else if (s.atc===0) {
			if (p>s.stake) return {bet: s.stake, position: offset+1};
			else return {bet: p, position: offset+1};
		}
		else {
			if (s.atc>=s.stake) return  {call: s.stake, position: offset+1};
			if (p+s.atc>s.stake-s.atc) return {raise: s.stake-s.atc, position: offset+1};
			else return {raise: p+s.atc, position: offset+1};
		}
	};

	var raiseAllin=function(s) {
		if (s.lb) {
			if (p>s.stake) return {raise: s.stake, position: offset+1};
			else return {raise: s.stake-s.atc, position: offset+1};
		}
		else if (s.bo===false) {
			var c=Math.min(s.atc,s.stake);
			return {call: c, position: offset+1};
		}
		else if (s.atc===0) {
			return {bet: s.stake, position: offset+1};
		}
		else {
			if (s.atc>=s.stake) return  {call: s.stake, position: offset+1};
			return {raise: s.stake-s.atc, position: offset+1};
		}
	};

	var checkFold=function(s) {
		if (s.lb) {
			return {check: "button", position: offset+1};
		}
		else if (s.bo===false) {
			return {fold: "button", position: offset+1};
		}
		else if (s.atc===0) {
			return {check: "button", position: offset+1};
		}
		else {
			return {fold: "button", position: offset+1};
		}
	};

	var checkCall=function(s) {
		var c;
		if (s.lb) {
			return {check: "button", position: offset+1};
		}
		else if (s.bo===false) {
			c=Math.min(s.atc,s.stake);
			return {call: c, position: offset+1};
		}
		else if (s.atc===0) {
			return {check: "button", position: offset+1};
		}
		else {
			c=Math.min(s.atc,s.stake);
			return {call: c, position: offset+1};
		}
	};

////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////// INPUT PROCESSING ////////////////////////////////////////////
// start:{position:1}
	var start = function(s){
		reset();
		offset = s.position-1;
		session = s.session
		return "ok";
	};

// seat:{position:1, name:"BigPete", stake:50}
	var seat = function(s){
		seats[s.position-1]=s;
		seats[s.position-1].btr=0;
		seats[s.position-1].bth=0;
		seats[s.position-1].status="active";
		return "ok";
	};

// button:{position:4}
	var button = function(s){
		buttonoffset = s.position-1;
		return "ok";
	};

// deal:{card1:"Ac", card2:"Td"}
	var deal = function(s){
		cards[0]=s.card1;
		cards[1]=s.card2;
		nextRound(1);
		return "ok";
	};

// flop:["Jh","Ks","4d"]
	var flop = function(s){
		board=s;
		nextRound(2);
		return "ok";
	};

// turn:"Qd"
	var turn = function(s){
		board.push(s);
		nextRound(3);
		return "ok";
	};

// river:"10h"
	var river = function(s){
		board.push(s);
		nextRound(4);
		return "ok";
	};

// action:{position:1, action:"blind", amount:2, stake:48, pot:[22,10]}
//                       "blind", "fold" , "call", "raise", "check", "bet"
	var action = function(s){

		seats[s.position-1].stake=s.stake;
		seats[s.position-1].btr=s.amount;
		pot=s.pot;

		if (s.action=="fold"){
			seats[s.position-1].status="folded";
		}

		if (roundNo==1){
			if (s.action=="call"){
				if(!raised) numLimpers+=1;
				else raiseCalled=true;
			}
			else if (s.action=="raise"){
				if(raised) reraised=true;
				else {
					raised=true;
					raiser=s.position-1;
				}
			}
		}
		else {
			if (s.action=="raise" || s.action=="bet"){
				if(raised) reraised=true;
				else {
					raised=true;
					raiser=s.position-1;
				}
			}
		}

		return "ok";
	};

// instruction:{position:1, atc:5, bl:5, lfb:2, lb:true, bo:true, stake:42, duration:2000})
	var instruction = function(s) {
		if ((s.position-1) === offset){
			return decidePlay(s);
		}
		else return "ok";
	};

// show:[{position:1, card1:"Ac", card2:"Td"},{position:2, card1:"7s", card2:"Jh"} ]
	var show = function(s) {
		return "ok";
	};

// adjust:{position:4, stake:42, pot:[60,50,40]}
	var adjust = function(s) {
		return "ok";
	};

// payoff:{pot:[2, 3], winner:[{ position:1 , amount: 20, stake:54, cards: "01"},
//                             { position:6 , amount: 20, stake:54, cards: "10"}], board:"10001"}
	var payoff = function(s) {
		return "ok";
	};

// restart:[{seat:{position:1, name:"BigPete", stake:50}}]
	var restart = function(s) {
		reset();
		for (var i = 0; i< s.length; i++){
			execute(s[i]);
		}
		return "ok";
	};

	var delay = function(s) {
	};

	var boughtin = false;
	var lobby = function(s) {
//      if (s.chips>=100) return {double:true};
		if (s.chips>=100) return {bank:true};
//      return (s.chips===0)?{buyin:1}:{play:true};
		if (s.chips > 0) return {play:true};
		if (boughtin){ // only one buyin allowed
			return "ok";
		} else {
			boughtin = true;
			return {buyin:buyinlevel};
		}
	};

// play:true
	var play = function(s) {
		return "ok";
	};
/////////////////////////////////////////////////////////////////////////////////////////////////////////

	var execute = function(command){
		if		(command.start)			{return start(command.start);}
		else if	(command.seat)			{return seat(command.seat);}
		else if	(command.button)		{return button(command.button);}
		else if	(command.deal)			{return deal(command.deal);}
		else if	(command.flop)			{return flop(command.flop);}
		else if	(command.turn)			{return turn(command.turn);}
		else if	(command.river)			{return river(command.river);}
		else if	(command.instruction)	{return instruction(command.instruction);}
		else if	(command.action)		{return action(command.action);}
		else if	(command.show)			{return show(command.show);}
		else if	(command.adjust)		{return adjust(command.adjust);}
		else if	(command.payoff)		{return payoff(command.payoff);}
		else if	(command.restart)		{return restart(command.restart);}
		else if	(command.delay)			{return delay(command.delay);}
		else if	(command.lobby)			{return lobby(command.lobby);}
		else if	(command.play)			{return play(command.play);}
	};

	var bot=function(command){
		rc = execute(command);
		if ((rc !== "ok") && (rc !== undefined) && session){rc.session = session;}
		return rc;
	};

	return bot;
};


var makeRobot = function(output, buyinlevel){
	// chops message up and feed to the bot.
	var i, rc;
	var robot = makeBot(buyinlevel);
	var input = function(message){
		for(i=0;i < message.length; i++){
			try {
				if (message[i].restart){robot = makeBot(buyinlevel);} // attempt to fix rogue robot on re-start
				rc = robot(message[i]);
			} catch (err) {
				log.error(err.name);
				log.error(err.message);
				log.error(err.stack);
			}
		// if (rc !== "ok"){log.info(JSON.stringify(message[i])+" => "+JSON.stringify(rc));}
		// log.info(JSON.stringify(message[i])+" => "+JSON.stringify(rc));
		}
		// adds random delay to action
		if ((rc !== "ok") && (rc !== undefined)){var action = rc; setTimeout(function(){output(action);}, Math.random()*5000);}
	};
	return input;
};

var makeClient = function(no, buyinlevel){
	var socket = io.connect("https://127.0.0.1:1337",{"force new connection": true});
	var output = function(s) {
		log.info("Robot"+no+" Sends an action: " + JSON.stringify(s));
		socket.emit('action', s);
	};
	var input = makeRobot(output,buyinlevel);
	socket.on("connect", function(){
		log.info("Robot"+no+" Connected to 127.0.0.1:1337");
		// socket.emit('action', {buyin: 1});
	});
	socket.on('message', function(message){
		log.info("Robot"+no+" Received a message: " + JSON.stringify(message));
		input(message);
	});
	socket.on('disconnect', function(){
		log.info("Robot"+no+" Disconnected from 127.0.0.1:1337");
	});
};

var clients=[];
var level = 1;
var count = 1;
for (level = 1; level < 7; level++){
	var botNumber = process.argv[level+1];
	if (botNumber){
		for (var i =1; i<=botNumber; i++) {
			clients.push(makeClient(count++, level));
		}
	}
}

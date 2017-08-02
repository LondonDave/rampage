var userInterface = function( input ){

	// constants
	var rank = {A:"A", 1:"1", 2:"2", 3:"3", 4:"4", 5:"5", 6:"6", 7:"7", 8:"8", 9:"9", T:"10", J:"J", Q:"Q", K:"K"};
	var suitClass = {c:"club", d:"diamond", h:"heart", s:"spade"};
	var suitRef = {c:"&clubs;", d:"&diams;", h:"&hearts;", s:"&spades;"};
	var transitionEnds = "webkitTransitionEnd oTransitionEnd transitionend";
	var interval = 0;
	var actionClasses = "pot blind check call bet raise fold win";

	// elements
	var seats = $(".seat");
	var actions = $(".action");
	var timers = $(".timer");
	var card1s = $(".card1");
	var card2s = $(".card2");
	var pots = $("#pot .amount");
	var board = $("#board .card");
	var bet = $("#control1 button");
	var raiseButton = $("#control2 #raise");
	var callButton = $("#control2 #call");
	var foldButton = $("#control2 #fold");
	var sitoutButton = $("#control2 #sitout");

	// shared variables
	var offset=0; // seat offset for this player
	var inputQueue=[];
	var session;

////////////////////// Private Functions /////////////////////////////

	// cancel instruction
	var cancel = function(){};

	// gather chips
	var gather = function(s, end) {
		if (end){
//			cancel();
			s = s.filter(function(){  // filter visible chips
				return ($(".chip", this).css('visibility') === "visible");
			});
			setTimeout( function(){log("gather");end();}, (s.length === 0)? 0 : 750 ); // avoids problem with multiple transition ends
			if (s.length !== 0) {
				setTimeout(function(){ // make invisible half way through
					$(".chip", s).css("visibility", "hidden");
					$(".amount", s).css("visibility", "hidden");
				}, 400);
				s.addClass("move").addClass("gather").bind(
						transitionEnds,
						function() {
							$(this).unbind(transitionEnds).removeClass("gather").removeClass("move");
							$(".chip", this).removeClass(actionClasses).css("visibility", "hidden");
							$(".amount", this).css("visibility", "hidden");
						}
				);
			}
		} else {
			$(".chip", s).removeClass(actionClasses).css("visibility", "hidden");
			$(".amount", s).css("visibility", "hidden");

		}
	};

	// fade tick and cross
	var fade = function(s, end) {
			s.css("-webkit-transition", "opacity 3s")
			.css("opacity", 0).bind(
					transitionEnds,
					function() {
						$(this).unbind(transitionEnds).css("visibility", "hidden").css("opacity", "1");
						if(end){log("fade");end();}
					}
			);
//			if(end){setTimeout( function(){log("end fade")end();}, 1500);}
		};

	// vanish
	var vanish = function(s, end) {
			s.toggleClass("vanish");
			setTimeout(function(){
				s.toggleClass("vanish").css("visibility", "hidden");
				if(end){log("vanish");end();}
			}, 1500 );
		};


	// timer (returns cancel function)
	var timer = function(s, end) {
			var countdown = 20;
			var clock = $(".clock",s);
			var left = $(".face.left.black",s);
			var right = $(".face.right.black",s);
			var timeout;

			var ticker = function more() {
				countdown--;
				if (countdown > 0) {
					if(countdown === 10){right.css("z-index",1);}
					(countdown>10?left:right).css("-webkit-transform", "rotate(" + 18 * ((20 - countdown)%10)+ "deg)");
					timeout = setTimeout(more, 1000);
				} else {
					right.css("z-index",0);
					clock.css("visibility", "hidden");
					if (end && (countdown === 0)){log("end timer");end("timeout");}
				}
			};
			var cancel = function() {
//				countdown = 0;
				clearTimeout(timeout);
				right.css("z-index",0);
				clock.css("visibility", "hidden");
//				if (end){ log("end timer");end("cancel");}

			};
			clock.css("visibility", "visible");
			ticker();
			return cancel;
		};

	var log = function(obj){console.log(new Date().getTime()+":"+JSON.stringify(obj));};

////////////////////// Commands /////////////////////////////

	// seat({position:1, name:"BigPete", stake:50}, end);
	var seat = function(s, end){
		var seat = seats.eq((s.position+5-offset)%6);
		seat.css("visibility", "visible");
		$(".name", seat).html(s.name);
		$(".stake", seat).html(s.stake);
		if(end){setTimeout(function(){log("end seat");end();},0);}
	};

	// button({position:4}, end);
	var button = function(s, end){
		var seat = seats.eq((s.position+5-offset)%6);
		$(".dealer", seat).css("visibility", "visible");
		if(end){setTimeout(function(){log("end button");end();},500);}
	};

	// action({position:1, action:"blind", amount:2, stake:48, pot:[22,10], allin:[null, null, null, 0,2]}, end);
	var action = function(s, end){
		var position = (s.position+5-offset)%6;
		var seat = seats.eq(position);
		var action = actions.eq(position);
		var timer = timers.eq(position);
		var i;

		if(cancel){cancel();cancel =function(){};} // kill current instruction

		if ((s.action === "fold") && (s.amount === 0)){
			var cross = $(".cross",timer);
//			var cross = $(".cross",action);
			cross.css("visibility", "visible");
			fade(cross);
		}

		if (s.action === "check"){
			var tick = $(".tick",timer);
//			var tick = $(".tick",action);
			tick.css("visibility", "visible");
			fade(tick);
		}

		if ( s.amount > 0) {
			action.removeClass("gather");
			$(".chip", action).removeClass(actionClasses).addClass(s.action).css("visibility", "visible");
			$(".amount", action).html(s.amount).css("visibility", "visible");
		}
		if (s.stake){
			$(".stake", seat).html(s.stake);
		}
		if(s.stake===0){
			s.allin.forEach(function(v, i){
				if (v!==null){
					$(".stake", seats[(i+6-offset)%6]).html("0/"+((v===0)?"M":v));
				}
			});
		}

		if (s.pot){ // check for no pot in payoff
			$("#pot .chip").css("visibility", "visible");
			for (var index = 0; index < pots.length; index++){
				if (index < s.pot.length){
					pots.eq(index).html(s.pot[index]).css("visibility", "visible");
				} else {
					pots.eq(index).html("").css("visibility", "hidden");
				}
			}
		}

		if (s.action === "fold" ){
			if(end){
				var count = 0;
				var inc = function(){count++; if(count === 3){if(end){setTimeout(function(){log("end action");end();},0);}}};
//				fade(card1s.eq(s.position-1), inc);
//				fade(card2s.eq(s.position-1), inc);
				vanish(card1s.eq(position), inc);
				vanish(card2s.eq(position), inc);
				gather(action, inc);
			} else {
				card1s.eq(position).css("visibility", "hidden");
				card2s.eq(position).css("visibility", "hidden");
				$(".chip", action).css("visibility", "hidden");
				$(".amount", action).css("visibility", "hidden");
			}
		} else {
			if(end){setTimeout(function(){log("end action");end();},0);}
		}


	};

	// deal({card1:"Ac", card2:"Td"}, end)
	var deal = function(s, end){
//		var index;
//		var pause = 100;
		if (end){
			card1s.addClass("deal move").css("visibility", "visible");
			card2s.addClass("deal move").css("visibility", "visible");
			seats.css("z-index", 1);
			setTimeout(function(){
					card1s.removeClass("move");
					card2s.removeClass("move");

					$(".suit", card1s.eq(0)).html(suitRef[s.card1.charAt(1)]);
					$(".rank", card1s.eq(0)).html(rank[s.card1.charAt(0)]);
					card1s.eq(0).addClass(suitClass[s.card1.charAt(1)]+" show");

					$(".suit", card2s.eq(0)).html(suitRef[s.card2.charAt(1)]);
					$(".rank", card2s.eq(0)).html(rank[s.card2.charAt(0)]);
					card2s.eq(0).addClass(suitClass[s.card2.charAt(1)]+" show");

					foldButton.bind( 'click', function(){cancel(); cancel=function(){};input({fold:"button", session:session});disable();}).html("Fold");
					sitoutButton.bind( 'click', function(){cancel(); cancel=function(){};input({sitout:"button", session:session});disable();}).html("Sit<br/>Out");

					log("end deal");
					end();
				},150);
//			for (index = 0; index < 12; index++){
//				((index < 6)?card1s:card2s).eq((s.position+index)%6)
//					.css("z-index", 12-index) // deal from the top
//					.addClass("move deal")
////					.css("-webkit-transition-delay", (pause*index+"ms"))
////					.css("-moz-transition-delay", (pause*index+"ms"))
//					.css("visibility", "visible")
//					.bind(transitionEnds, function(){
//							// after dealer's second card show seat 1
//							if($(this).css("z-index") == 1){
//							player.position = 1;
//							setTimeout(function(){show([player], function(){log("end deal");end();});},0);
//							seats.css("z-index", 1);
//							};
//							$(this).css("z-index", 0) // first card below
//								.unbind(transitionEnds);
////								.css("-webkit-transition-delay", "0ms")
////								.css("-moz-transition-delay", "0ms")
//
//					});
//			};
		} else {
			card1s.addClass("deal").css("visibility", "visible");
			card2s.addClass("deal").css("visibility", "visible");
			seats.css("z-index", 1);
			$(".suit", card1s.eq(0)).html(suitRef[s.card1.charAt(1)]);
			$(".rank", card1s.eq(0)).html(rank[s.card1.charAt(0)]);
			card1s.eq(0).addClass(suitClass[s.card1.charAt(1)]+" show");

			$(".suit", card2s.eq(0)).html(suitRef[s.card2.charAt(1)]);
			$(".rank", card2s.eq(0)).html(rank[s.card2.charAt(0)]);
			card2s.eq(0).addClass(suitClass[s.card2.charAt(1)]+" show");

			foldButton.bind( 'click', function(){cancel(); cancel=function(){};input({fold:"button", session:session});disable();}).html("Fold");
			sitoutButton.bind( 'click', function(){cancel(); cancel=function(){};input({sitout:"button", session:session});disable();}).html("Sit<br/>Out");
		}
	};

	// show( [{position:1, card1:"Ac", card2:"Td"},{position:2, card1:"7s", card2:"Jh"} ], end)
	var show = function(s, end){
		var index, card1, card2;
		for(index = 0; index < s.length; index++){
			card1 = card1s.eq((s[index].position+5-offset)%6);
			$(".suit", card1).html(suitRef[s[index].card1.charAt(1)]);
			$(".rank", card1).html(rank[s[index].card1.charAt(0)]);
			card1.addClass(suitClass[s[index].card1.charAt(1)]+" show");

			card2 = card2s.eq((s[index].position+5-offset)%6);
			$(".suit", card2).html(suitRef[s[index].card2.charAt(1)]);
			$(".rank", card2).html(rank[s[index].card2.charAt(0)]);
			card2.addClass(suitClass[s[index].card2.charAt(1)]+" show");
		}
		if(end){setTimeout(function(){log("end show");end();},1000);}
	};


	// disable buttons
	var disable  = function(){
		bet.eq(0).unbind("click");
		bet.eq(1).unbind("click");
		bet.eq(2).unbind("click");
		bet.eq(3).unbind("click");
		raiseButton.unbind("click").html("&nbsp");
		callButton.unbind("click").html("&nbsp");
	};


	// instruction({position:1, atc:5, bl:5, lfb:2, lb:true, stake:42, duration:2000}, end)
	var instruction = function(s, end){
		var state;

		// button routines
		var bets = [], sum;
		var setRaise = function(event){
			for ( sum = (state === 3)?0:s.lfb, index = 0; index < bets.length; index++){ sum = sum + bets[index]; }
			if (event.data!==0) {
				if ( sum < s.stake-s.atc){
					bets.push(event.data);
					sum = sum + event.data;
				}
			} else if (bets.length > 0){
				sum = sum - bets.pop();
			}
			raiseButton.html(((state === 3)?"Bet":"Raise")+"<br/>"+((sum < s.stake-s.atc)? sum:"Allin"));
		};
		var doRaise = function(){
			for ( var sum=(state === 3)?0:s.lfb, index = 0; index < bets.length; index++){ sum = sum + bets[index]; }
			sum = Math.min(sum, s.stake-s.atc);
			var raise = {};
			if (state===3){raise.bet = sum;} else {raise.raise = sum;}
			raise.session = session;
			input(raise);
			disable();
			cancel();
			cancel=function(){};
		};
		var doCall = function(){
			input(((state === 1) || (state === 3))?{check:"button", session:session}:{call:Math.min(s.atc, s.stake), session:session});
			disable();
			cancel();
			cancel=function(){};
		};
		var doEnd = function(result){
			if(result==="timeout"){if (s.atc > 0){input({fold:"timeout", session:session});} else {input({check:"timeout", session:session});}}
			disable();
//			cancel = function(){};
//			end();
		};

		if (end){
			cancel = timer(timers.eq((s.position+5-offset)%6), (s.position === 1+offset)?doEnd:function(){});

			// enable buttons
			if ((s.position+5-offset)%6===0) {
				if (s.lb){state = 1;} // LiveBlind
//				else if ((s.atc > 0) && (s.atc < s.lfb)){state = 2;} // BettingClosed
				else if (s.bo===false){state = 2;} // BettingClosed
				else if (s.atc === 0){state = 3;} // Unraised
				else{state = 4;} // Raised

				callButton.html(((state === 1) || (state === 3)) ? "Check"	: ("Call<br/>" + ((s.stake>s.atc)?s.atc:"Allin")));
				callButton.bind("click", doCall);

				if (state !== 2){
					if (s.stake > s.atc+s.lfb) {
						bet.eq(0).bind("click", 25, setRaise);
						bet.eq(1).bind("click", 5, setRaise);
						bet.eq(2).bind("click", 1, setRaise);
						bet.eq(3).bind("click", 0, setRaise);
					}
					if (s.stake>s.atc){
						raiseButton.html(     (state === 3) ? ("Bet"+"<br/>" + 0):( "Raise" + "<br/>" +((s.stake > s.atc+s.lfb)?s.lfb:"Allin") )    );
						raiseButton.bind("click", doRaise);
					}
				}
			}
			setTimeout(function(){log("end instruction"); end();},0);
			return cancel;

		} else {
			return function() { };
		}
	};

	// flop(["Jh","Ks","4d"], end)
	var flop = function(s, end){
		var flopper = function(){
			for (var index = 0 ; index < 3; index++) {
				$(".suit", board[index]).html(suitRef[s[index].charAt(1)]);
				$(".rank", board[index]).html(rank[s[index].charAt(0)]);
				$(board[index]).addClass(suitClass[s[index].charAt(1)]).css("visibility", "visible");
			}
		};

		if (end){
			gather(actions, flopper);
			setTimeout(function(){log("end flop"); end();},1500);
		} else {
			gather(actions);
			flopper();
		}
	};

		// turn("Qd", end)
	var turn = function(s, end) {
			var turner = function() {
				$(".suit", board[3]).html(suitRef[s.charAt(1)]);
				$(".rank", board[3]).html(rank[s.charAt(0)]);

				$(board[3]).addClass(suitClass[s.charAt(1)]).css("visibility","visible");
			};
			if (end){
				gather(actions, turner);
				setTimeout(function(){log("end turn"); end();},1500);
			} else {
				gather(actions);
				turner();
			}


		};

	// river("10h", end)
	var river = function(s, end) {
		var riverer = function(){
			$(".suit", board[4]).html(suitRef[s.charAt(1)]);
			$(".rank", board[4]).html(rank[s.charAt(0)]);
			$(board[4]).addClass(suitClass[s.charAt(1)]).css("visibility","visible");
		};
		if (end){
			gather(actions, riverer);
			setTimeout(function(){log("end river"); end();},1500);
		} else {
			gather(actions);
			riverer();
		}
	};


	// adjust({position:4, stake:42, pot:[60,50,40]}, end)
	var adjust = function(s, end) {
		for ( var index = 0; index < pots.length; index++) {
			if (index < s.pot.length) {
				pots.eq(index).html(s.pot[index]).css("visibility", "visible");
			} else {
				pots.eq(index).html("").css("visibility", "hidden");
			}
		}
		$(".stake", seats.eq((s.position+5-offset)%6)).html(s.stake);
		if(end){setTimeout(function(){log("end adjust"); end();},0);}
	};

	// payoff({pot:[2, 3], winner:[{ position:1 , amount: 20, stake:54, cards: "01"},
	//                             { position:6 , amount: 20, stake:54, cards: "10"}], board:"10001"}, end)
	var payoff = function(s, end) {
		var	i,
			highlightDuration = 1000,
			pushDuration = 1000,
			lingerDuration = 3000;
		if(end){

			gather(actions, function(){

				console.log("start highlight");

				// highlight pots and winning cards
				if(s.board) {
					$(".card").add(pots).addClass("shade");
					for (i=0;i<s.pot.length; i++){ pots.eq(s.pot[i]).removeClass("shade");}
					for (i=0;i<s.winner.length; i++){
						if (s.winner[i].cards[0]==="1"){card1s.eq((s.winner[i].position+5-offset)%6).removeClass("shade");}
						if (s.winner[i].cards[1]==="1"){card2s.eq((s.winner[i].position+5-offset)%6).removeClass("shade");}
					}
					for (i=0;i<5;i++){if (s.board[i]==="1"){board.eq(i).removeClass("shade");}}
				}

				// animate chip payoff
				for (i=0;i<s.winner.length; i++){
					actions.eq((s.winner[i].position+5-offset)%6).addClass("gather");
				}
				setTimeout( function(){
					console.log("start push");
					if(s.pot.some(function(v){return v===0;})){$("#pot .chip").css("visibility","hidden");}
					for (i=0;i<s.pot.length; i++){
						pots.eq(s.pot[i]).removeClass("shade").css("visibility","hidden");
					}
					var remove2 = function(){$(this).unbind(transitionEnds).removeClass("move2");};
					for (i=0;i<s.winner.length; i++){
						var action = actions.eq((s.winner[i].position+5-offset)%6);
						$(".chip", action).removeClass(actionClasses).css("visibility", "visible");
						$(".amount", action).css("visibility", "visible").html(s.winner[i].amount);
						action.addClass("move2").removeClass("gather").bind(transitionEnds, remove2);
					}
				}, s.board?highlightDuration:0);

				// hide chips update stake and end
				setTimeout( function(){
						var i;
						console.log("start stake");
						for (i=0;i<s.winner.length; i++){
							$(".stake", seats.eq((s.winner[i].position+5-offset)%6)).html(s.winner[i].stake);
						}
						$(".chip", actions).css("visibility", "hidden");
						$(".amount", actions).css("visibility", "hidden");
						if(end){setTimeout(function(){log("end payoff"); end();}, s.board?lingerDuration:200);}
					}, s.board?highlightDuration+pushDuration:pushDuration);
			});


		} else {
			gather(actions);
			$(".card").add(pots).addClass("shade");
			for (i=0;i<s.pot.length; i++){ pots.eq(s.pot[i]).css("visibility","hidden");}
			$(".stake", seats.eq((s.position+5-offset)%6)).html(s.stake);
		}
	};


	// restart( [{seat:{position:1, name:"BigPete", stake:50}}], end)
	var restart = function(s, end){

		// cancel timer
		if(cancel){cancel();cancel = function(){};}
		// reset classes
		seats.css("z-index",0);
		$(".card").css("visibility", "hidden").removeClass("club heart diamond spade");
		card1s.removeClass("deal show");
		card2s.removeClass("deal show");
		$(".card .suit").html("");
		$(".card .rank").html("");
		$(".name").html("");
		$(".stake").html("");
		$(".seat").css("visibility", "hidden");
		$(".dealer").css("visibility", "hidden");
		$(".card").add(pots).removeClass("shade").css("z-index",0);
		$("#pot .chip").css("visibility", "hidden").removeClass("shade");
		pots.css("visibility", "hidden");
		$(".chip", actions).css("visibility", "hidden");
		$(".amount", actions).css("visibility", "hidden");

		foldButton.unbind("click").html("&nbsp");
		sitoutButton.unbind("click").html("&nbsp");

		// execute restart instructions
		if (s)
			for (var i=0; i<s.length; i++){
				execute(s[i]); // end undefined - no animation
			}

		if(end){setTimeout(function(){log("end restart"); end();},0);}
	};

	// delay
	var delay = function(s, end){
		if(end){setTimeout(function(){log("end delay"); end();},s);}
	};

	// lobby
	var lobby = function(s, end){
		restart();
		$(".table").css("visibility", "hidden");
		if (s.chips === 0){
			$("#buyin").css("visibility", "visible");
		} else if ((s.chips < 100 ) && (s.ingame===false)){
			$("#play").css("visibility", "visible");
			$("#play p").html("YOU HAVE <br/><br/>"+s.chips+" CHIPS x "+["10p","20p","40p","80p","£1.60","£3.20","£6.40"][s.level-1]);
		} else if (s.chips>=100){
			$("#bankordouble").css("visibility", "visible");
			$("#bankordouble p").html("YOU HAVE <br/><br/>"+s.chips+" CHIPS x "+["10p","20p","40p","80p","£1.60","£3.20","£6.40"][s.level-1]);
		} else if (s.ingame===true){
			$("#table").css("visibility", "visible");
			input({play:1});
		} else if (s.ingame===false){// poker server not yet started
			input({connect:true});
		}
		if(end){setTimeout(function(){log("end lobby"); end();},0);}
	};

	// start
	var start = function(s, end){
		restart();
		offset = s.position-1;
		session = s.session;
		$("#table").css("visibility", "visible");

//		// reset classes
//		seats.css("z-index",0);
//		$(".card").css("visibility", "hidden").removeClass("club heart diamond spade");
//		card1s.removeClass("deal show");
//		card2s.removeClass("deal show");
//		$(".card .suit").html("");
//		$(".card .rank").html("");
//		$(".name").html("");
//		$(".stake").html("");
//		$(".seat").css("visibility", "hidden");
//		$(".dealer").css("visibility", "hidden");
//		$(".card").add(pots).removeClass("shade").css("z-index",0);
//		$("#pot .chip").css("visibility", "hidden").removeClass("shade");
//		pots.css("visibility", "hidden");
//		$(".chip", actions).css("visibility", "hidden");
//		$(".amount", actions).css("visibility", "hidden");

//		restart(end);
		if(end){setTimeout(function(){log("end start"); end();},0);}
	};

//	// play
//	var play = function(s, end){
//		input({play:1});
//		if(end){setTimeout(function(){log("end play"); end();},0);}
//	};


	$("#buyin").bind( 'click', function(){ input({buyin:1});});	//lobby({chips:50, level:1, ingame:true});
	$("#play").bind( 'click', function(){input({play:1});});	//start
	$("#bank").bind( 'click', function(){ input({bank:1});});	//lobby({chips:0});
	$("#double").bind( 'click', function(){input({double:1});});//lobby({chips:55, level:2, ingame:true});

	// execute
	var execute = function(command, end){
		if (command.start)			{start(command.start, end);}
		else if (command.seat)		{seat(command.seat, end);}
		else if (command.button)		{button(command.button, end);}
		else if (command.action)		{action(command.action, end);}
		else if (command.deal)		{deal(command.deal, end);}
		else if (command.flop)		{flop(command.flop, end);}
		else if (command.river)		{river(command.river, end);}
		else if (command.turn)		{turn(command.turn, end);}
		else if (command.instruction)		{cancel = instruction(command.instruction, end);}
		else if (command.show)		{show(command.show, end);}
		else if (command.adjust)		{adjust(command.adjust, end);}
		else if (command.payoff)		{payoff(command.payoff, end);}
		else if (command.restart)		{restart(command.restart, end);}
		else if (command.delay)		{delay(command.delay, end);}
		else if (command.lobby)		{lobby(command.lobby, end);}
//		else if (command.play)		{play(command.play, end);}
	};

	// sequencer
//var sequence = function(data){
//	var index = -1;
//	var next =  function more(){
//		index++;
//		if(data[index] !== undefined){
//			setTimeout(function(){execute(data[index], more);}, interval);
//		};
//	};
//	next();
//};

	var sequence = function(){
		var next =function more(){
			var command;
			if(inputQueue.length > 0){
				command = inputQueue.shift();
				setTimeout(function(){console.log(new Date().getTime()+": execute  "+JSON.stringify(command)); execute(command, more);}, interval);
			}
		};
		next();
	};

	var queue = function(data){
		var i;
		console.log(new Date().getTime()+":----------------------------------------------------------------------------------------------------");
		for(i=0;i<data.length;i++){
			console.log(new Date().getTime()+":"+JSON.stringify(data[i]));
			inputQueue.push(data[i]);
		}
		if (inputQueue.length === data.length){
			console.log(new Date().getTime()+":calling sequence()");
			sequence();
		}

	};

	// return
	return queue;
};

/*require([ "jquery-1.7", "socket.io/socket.io", "//connect.facebook.net/en_US/all.js" ], function() {
	(function($) {
		$(document).ready(function() {
			var socket;
//			window.addEventListener("load",function() {	setTimeout(function(){window.scrollTo(0, 1);}, 100);}); // hide url banner on iPhone (untested)
			FB.init({
				appId      : '282935625136675',
				status     : true, // check login status
				cookie     : true, // enable cookies to allow the server to access the session
//				xfbml      : true,  // parse XFBML
				oauth     : true
			});
			FB.login(function(response) {
//			FB.Event.subscribe('auth.statusChange', function(response) {
				console.log(JSON.stringify(response));
				if (response.authResponse) {
					console.log( "user has auth'd your app and is logged into Facebook");
					console.log(JSON.stringify(response.authResponse));
					socket = io.connect('/?accessToken='+response.authResponse.accessToken+'&userID='+response.authResponse.userID);
					var input = function(s) {
						// if(session)(s.session = session);
						socket.emit('action', s);
						console.log(new Date().getTime()+":===>"+JSON.stringify(s));
					};
					var output = userInterface(input);
					socket.on('message', function(data) {
						output(data);
					});
				} else {
					console.log("No authResponse");
//					socket = io.connect('https://ec2-50-17-51-112.compute-1.amazonaws.com:1337/');
//					$("#login").css("visibility", "visible");
				}
			});

		});
	})(jQuery);
});*/


require([ "jquery-1.7", "socket.io/socket.io" ], function() {
	(function($) {
		$(document).ready(function() {
				var socket = io.connect('/');
				var input = function(s) {
					socket.emit('action', s);
					console.log(new Date().getTime()+":===>"+JSON.stringify(s));
				};
				var output = userInterface(input);
				socket.on('message', function(data) {
					output(data);
				});
			});
	})(jQuery);
});



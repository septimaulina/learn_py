odoo.define('pos_discount_promotion.models', function (require) {
 "use strict";
 
 var Model = require('web.DataModel');
 var screens = require('point_of_sale.screens');
 var models = require('point_of_sale.models');
 var core = require('web.core');
 var ajax = require('web.ajax');
 var QWeb     = core.qweb;
 var _t = core._t;
 var _super_posorder = models.Order.prototype;
 var _super_posmodel = models.PosModel.prototype;
 var _super_orderlinemodel = models.Orderline.prototype;
 var utils = require('web.utils');
 var round_pr = utils.round_precision;
 var round_di = utils.round_decimals;
 var formats = require('web.formats');
 var orderline_id = 1;
 
 models.load_models([
                     {
                         model: 'discount.promotion',
                         fields: ['name','disc_promotion_line','active'],
                         domain: [['active','=',true]],
                         loaded: function(self,discount){
                             self.discount = discount;
                         },
                     }
                 ]);
models.load_models([
					{
					    model: 'discount.promotion.line',
					    fields: ['disc_promotion_id','code_change_disc','customer_disc_type','date_start','date_end','inventory_type_ids','percent_discount','all_branch','spec_branch','bank_id','using_sku','sku_id','product_2nd_disc_1','product_2nd_disc_2','state','use_price_discount','price_discount','gift','every_purchase','gift_exist'],
					    loaded: function(self,disc){
					        self.disc = disc;
					    },
					}
]);
models.load_models([
					{
					    model: 'inventory.type.line',
					    fields: ['discount_promotion_line_id','four_digit_prefix_sku','exception_sku','discount','inventory_type_ids','all_inventory','all_branch','spec_branch','origin','supplier_id','brand_id'],
					    loaded: function(self,inventory){
					        self.inventory = inventory;
					    },
					}
]);
models.load_models([
					{
						model: 'product.product',
						fields: ['id','name','qty_available', '	location_id'],

						domain: function(self){
							var active_disc = []
							for (var i=0;i<self.disc.length;i++){
								for (var d=0;d<self.discount.length;d++){
									if (self.disc[i].disc_promotion_id[0] == self.discount[d].id){
										for (var g=0;g<self.disc[i].gift.length;g++){
											active_disc.push(self.disc[i].gift[g])
										}		
									}
								}
								
							}							
							return [['id','in', active_disc]];
						},
						loaded: function(self, product){
							self.gift_ids = product;
						},
					}
]);
models.load_models([
					{
						model: 'stock.quant',
						fields: ['product_id', 'qty', 'location_id'],

						loaded: function(self,location){
							self.location = location;
						},
					}
					]);
models.load_models([
					{
						model: 'stock.location',
						fields: ['id', 'usage', 'name'],
						loaded: function(self, locat){
							self.locat = locat;
						},
					}
					]);

 models.PosModel = models.PosModel.extend({
	 initialize: function (session, attributes) {
		 //push field name in model product.product
		 this.disc = [];
		 this.gift_ids = [];
		 this.locat = [];

		 for(var i=0;i<this.models.length;i++){
    		 var model = this.models[i]
    		 if(model.model === 'product.product'){    		
    			 model.fields.push('inventory_type_id', 'name');
    			 model.fields.push('brand_id');
    			 model.fields.push('origin');
    			 model.fields.push('supplier_id');  
    		 	}
    		 }
         //push fields partner_type in model res.partner
         for(var i=0;i<this.models.length;i++){
             var model = this.models[i]
             if(model.model === 'res.partner' && model.domain[0][0] === 'is_branch'){
                model.fields.push('discpromo_id');  
                }
             }
         //push fields bank_id in model account.journal
         for(var i=0;i<this.models.length;i++){
    		 var model = this.models[i]
    		 if(model.model === 'account.journal'){    		
    			 model.fields.push('bank_id');  
    		 	}
    		 }

    	// push fields usage in model stock location
    	 for(var i=0;i<this.models.length;i++){
         	 var model = this.models[i]
         	 if(model.model === 'stock.location'){
         		model.fields.push('location_id');
         	 }
         } 
         return _super_posmodel.initialize.call(this, session, attributes);
     },
 });
 
 //2nd Discount 
 models.Orderline = models.Orderline.extend({
	 initialize: function(attr,options){
	        this.pos   = options.pos;
	        this.order = options.order;
	        if (options.json) {
	            this.init_from_JSON(options.json);
	            return;
	        }
	        this.product = options.product;
	        this.set_product_lot(this.product)
	        this.price   = options.product.price;
	        this.set_quantity(1);
	        this.discount = 0;
	        this.discountStr = '0';
	        this.type = 'unit';
	        this.selected = false;
	        this.id       = orderline_id++;
	        this.scd_disc = 0;
	        this.percent_discount_product = 0;
	        this.second_discount = 0;
	        this.tax = 0;
     },
     
     //var global second_discount
     export_as_JSON: function(){
    	 var json = _super_orderlinemodel.export_as_JSON.apply(this,arguments);
 		 json.second_discount = this.second_discount;
 		 return json;
     },
     
     //var global second_discount
     init_from_JSON: function(json){
    	 _super_orderlinemodel.init_from_JSON.apply(this,arguments);
 		 this.second_discount = json.second_discount;
     },
	    
	 get_2nd_disc: function(){
		 return Math.round(this.scd_disc);
	 },
	 
	 get_unit_display_price: function(){
	        if (this.pos.config.iface_tax_included) {
	            var quantity = this.quantity;
	            this.quantity = 1.0;
	            var price = this.get_all_prices().priceWithTax;
	            this.quantity = quantity;
	            if (this.discount > 0){
	            	return this.get_unit_price() + (this.get_unit_price() * (this.get_taxes()[0].amount/100));
	            }else if (this.second_discount > 0 ){
	            	return this.get_unit_price() + (this.get_unit_price() * (this.get_taxes()[0].amount/100));
	            }
	            else{
	            	return price;
	            }
	        } else {
	            return this.get_unit_price();
	        }
	    },

	 check_discount_on_date: function(discount_line){
		 var date_today = new Date();
		 var date_parse = Date.parse(date_today);
		 if(date_parse>=Date.parse(this.pos.disc[discount_line].date_start) && date_parse <= Date.parse(this.pos.disc[discount_line].date_end) ){
			 return true ;
		 }
		 else{
			 return false
		 }
	 },
	 
	 //2nd discount
	 compute_second_discount: function(taxes,base,quantity, currency_rounding,total_included){
	        var order = this.pos.get_order();
	        var lines = this.order.orderlines
	        if (order){
	        	var lenth_orderline = order.orderlines.length
	        }
	        var after_discount = 0
	        if (this.get_discount_str() != 0 && quantity>=2 && lenth_orderline == 1 ) //same sku 2nd discount
	        {
	        	var id_sku_lowest = this.get_product().id;
	        	for(var l=0; l<this.pos.disc.length;l++)
				{
	            	if (this.check_discount_on_date(l) && id_sku_lowest == this.pos.disc[l].product_2nd_disc_1[0] && id_sku_lowest == this.pos.disc[l].product_2nd_disc_2[0]){
	            		var discount_real = this.pos.disc[l].percent_discount
	            		var disc_real= Math.min(Math.max(parseFloat(discount_real) || 0, 0),100);
	    	        	var price = total_included /quantity; 
	    	        	var discount_product = price *(disc_real /100)
	    	        	this.scd_disc = discount_product;
	    	        	this.second_discount = disc_real;
	    	        	var price_after_discount = price - discount_product
	    	        	total_included = (total_included - price) + price_after_discount
	    	        	after_discount = total_included ; 
	    	        	order.is_second_discount = true;
	    	        	break;
	            	}else{
	            		after_discount = total_included
	            	}
				}
	        }
	        else if (this.get_discount_str() != 0  && lenth_orderline > 1 ) //different sku 2nd discount
	        {		
	        	var sku_product_1 = false
				var sku_product_2 = false
				var position_sku_product_1 = 0
				var position_sku_product_2 = 0
				var more_then_2_sku = false
				var discount = 0
				for ( var i = 0 ; i < lines.models.length; i++){
					if(lines.models[i].percent_discount_product !=0){
						discount = lines.models[i].percent_discount_product
						var price = total_included /quantity; 
						var discount_product = price *(discount /100)
						this.scd_disc = discount_product
						this.second_discount = discount;
						var price_after_discount = price - discount_product
	    	        	total_included = (total_included - price) + price_after_discount
	    	        	after_discount= total_included
	    	        	order.is_second_discount = true;
						break;
					}else{
	            		after_discount = total_included
					}

				}       	
	        }else{ 
	        	after_discount = total_included
	        }
	        return after_discount ;
	    },
	 
	 //2nd discount
	 compute_all: function(taxes, price_unit, quantity, currency_rounding) {
	        var self = this;
	        var list_taxes = [];
	        var currency_rounding_bak = currency_rounding;
	        if (this.pos.company.tax_calculation_rounding_method == "round_globally"){
	           currency_rounding = currency_rounding * 0.00001;
	        }
	        var total_excluded = round_pr(price_unit * quantity, currency_rounding);
	        var total_included = total_excluded;
	        
	        var base = total_excluded;
	        _(taxes).each(function(tax) {
	            tax = self._map_tax_fiscal_position(tax);
	            if (tax.amount_type === 'group'){
	                var ret = self.compute_all(tax.children_tax_ids, price_unit, quantity, currency_rounding);
	                total_excluded = ret.total_excluded;
	                base = ret.total_excluded;
	                total_included = ret.total_included;
	                list_taxes = list_taxes.concat(ret.taxes);
	            }else{
	                var tax_amount = self._compute_all(tax, base, quantity);
	                tax_amount = round_pr(tax_amount, currency_rounding);

	                if (tax_amount){
	                    if (tax.price_include) {
	                        total_excluded -= tax_amount;
	                        base -= tax_amount;
	                    }
	                    else {
	                        total_included += tax_amount;
	                    }
	                    if (tax.include_base_amount) {
	                        base += tax_amount;
	                    }
	                    var data = {
	                        id: tax.id,
	                        amount: tax_amount,
	                        name: tax.name,
	                    };
	                    list_taxes.push(data);
	                }
	            }
	        });

	        var after_discount
	        if (this.discountStr.search("product")==0){// only second discount
	        	after_discount = this.compute_second_discount(taxes,total_excluded,quantity, currency_rounding,total_included);
	        }else{
	        	after_discount = total_included
	        }
	        return {
	            taxes: list_taxes,
	            total_excluded: round_pr(total_excluded, currency_rounding_bak),
	            total_included: round_pr(after_discount, currency_rounding_bak)
	        };
	 },

 });


 models.Order = models.Order.extend({
	 initialize: function (session, attributes) {
		 this.disc_bank = 0;
		 this.is_second_discount = false;//(Second Discount)
		 this.is_discount_bundling = false;//discount bundling
		 this.discount_bundling_percent = 0
	     this.discount_bundling_price = 0
	     this.product_get_name__discount_bundling = ''
	     this.use_price_discount = false
	     this.disc_bundling_product =0
         return _super_posorder.initialize.call(this, session, attributes);
     },
     
     get_disc_percent_bank: function(){
   		return (this.disc_bank * 100 / this.pos.get_order().get_total_without_tax()); 
   	 },
     
     get_disc_bank: function(){
  		return this.disc_bank; 
  	 },
  	 
  	 //Discount Bank
  	 get_due: function(paymentline){
  		var order = this.pos.get_order();
        if(!paymentline){
        	var due = this.get_total_with_tax() - this.get_total_paid();
        }else{
            var due = this.get_total_with_tax();
            var lines = this.paymentlines.models;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i] === paymentline){
                    break;
                }else{
                    due -= lines[i].get_amount();
                }
            }
        }
        return round_pr(Math.max(0,due), this.pos.currency.rounding);
  	 },

     export_as_JSON: function(){
    	 var json = _super_posorder.export_as_JSON.apply(this,arguments);
 		 json.disc_bank = this.disc_bank;
 		 json.discount_bundling_price = this.discount_bundling_price;
 		 json.is_discount_bundling = this.is_discount_bundling
 		 json.disc_bundling_product = this.disc_bundling_product
 		 json.product_get_name__discount_bundling = this.product_get_name__discount_bundling
 		 return json;
     },
     
     init_from_JSON: function(json){
    	 _super_posorder.init_from_JSON.apply(this,arguments);
 		 this.disc_bank = json.disc_bank;
 		 this.discount_bundling_price = json.discount_bundling_price;
 		 this.disc_bundling_product = json.disc_bundling_product
 		 if(json.is_discount_bundling){
 			this.check_discount_bundling(json)
 		 }
     },
     
     check_discount_bundling(json){
    	 var same = 0
    	 for(var i = 0 ; i < json.lines.length ; i++){
 			 for (var j = 0 ; j < this.disc_bundling_product.length ; j++){
 				 if (this.disc_bundling_product[j] ==json.lines[i][2].product_id ){
 					 same+=1
 					 if (same == this.disc_bundling_product.length){
 						this.discount_bundling_price =json.discount_bundling_price;
 						this.is_discount_bundling=true
 						this.product_get_name__discount_bundling = json.product_get_name__discount_bundling
 					 }
 					 else{
 						this.discount_bundling_price =0;
 					 }
 				 }
 			 }
 		 }
     },
     
	 init: function(parent,options){
	        this._super(parent,options);
	        this.hidden = false; 
	        this.discount_elizabeth = 0;
	        this.productlistscreen = new screens.ProductListWidget(this,{});
	        this.is_second_discount = false;//(Second Discount)
	        this.is_discount_bundling = false//is discount bundling
	        this.discount_bundling_percent = 0
	        this.discount_bundling_price = 0
	        this.use_price_discount = false
	        this.product_get_name__discount_bundling = ''
	        this.value_ep = 0;//(FreeGift Discount)
	        this.gift_ep = 0;//(FreeGift Discount)
            this.spec_of_branch = 0;
	        this.disc_bundling_product =0
	 },
	 
	 get_subtotal : function(){
	        return Math.round(round_pr(this.orderlines.reduce((function(sum, orderLine){
	            return sum + orderLine.get_display_price();
	        }), 0), this.pos.currency.rounding));
	 },

	 
	 //Get Total with Tax (Second Discount and Discount Bank)
     get_total_with_tax: function() {
     		if( this.is_discount_bundling){
    			return this.get_subtotal() - this.get_disc_bank() - this.discount_bundling_price;
     		}else{
    			return this.get_subtotal() - this.get_disc_bank();
    		}
		        
	 },
	 
     
     //(Second Discount)
     set_2nd_disc_merge:function(disc_line){
	    	var lines = this.get_orderlines();	
	    	var order = this.pos.get_order();
	    	var new_line_lowest_price ;
	 		var last_line_lower_price;
	 		if(lines.length ==1){
	 			if (lines[0].get_quantity() >= 2){
	 				var id_sku_lowest = lines[0].get_product().id;
	 					if (id_sku_lowest == this.pos.disc[disc_line].product_2nd_disc_1[0] && id_sku_lowest == this.pos.disc[disc_line].product_2nd_disc_2[0]){
	 	            		
	 	            		var discount_real = this.pos.disc[disc_line].percent_discount
	 	            		var disc_real= Math.min(Math.max(parseFloat(discount_real) || 0, 0),100);
	 	            		order.orderlines.at(0).discountStr = "product get "+discount_real;
	 	            		order.orderlines.at(0).trigger('change',order.orderlines.at(0));
	 	            		this.set_discount_first_product = true;
	 	            		this.is_2nd_discount = true;
	 	            		return true ;
	 	            	}
	 			}
	 		}else if(lines.length >=2){
	 				if(this.set_discount_first_product){
	 					order.orderlines.at(0).discount = 0;
	 					order.orderlines.at(0).is_2nd_discount = false;
	 					order.orderlines.at(0).discountStr = '0';
	 					//to refresh view for hide discount text
	 					order.orderlines.at(0).set_selected(true);
	 					order.orderlines.at(0).set_selected(false);
	 					this.set_discount_first_product = false;
	 				}
	 			
	 				new_line_lowest_price=0;
	 				var sku_product_1 = -1
	 				var sku_product_2 = -1
	 				var position_sku_product_1 = 0
	 				var position_sku_product_2 = 0
	 				var more_then_2_sku = false

	 				lines[new_line_lowest_price].percent_discount_product = 0;
	 				for ( var i = 0 ; i < lines.length; i++){
	 					lines[i].percent_discount_product = 0 //reset percent_discount_product
	 					order.orderlines.at(i).discountStr = '0'
						order.orderlines.at(i).trigger('change',order.orderlines.at(i));
	 					if (order.orderlines.at(i).discount >0){
	 						order.orderlines.at(i).discountStr = ''+order.orderlines.at(i).discount 
	 						order.orderlines.at(i).trigger('change',order.orderlines.at(i));
	 					}
	 					
	 					if((lines[i].get_product().id == this.pos.disc[disc_line].product_2nd_disc_1[0] || lines[i].get_product().id == this.pos.disc[disc_line].product_2nd_disc_2[0] )){
	 						if(sku_product_1 == -1){
	 							sku_product_1 = lines[i].get_product().barcode ;
		 						position_sku_product_1=i			 						
	 						}
	 						else if (sku_product_1 != -1 && sku_product_2 == -1   ){
	 							sku_product_2 = lines[i].get_product().barcode ;
		 						position_sku_product_2=i;
		 						break;
	 						}
	 					}
		 					
	 				}

	 				//same sku but more than 1 line
	 				if(sku_product_1 != -1 && sku_product_2 == -1  && lines[position_sku_product_1].get_quantity() > 1){
	 					//product discount is same
	 					if (this.pos.disc[disc_line].product_2nd_disc_1[0] == this.pos.disc[disc_line].product_2nd_disc_2[0]){
	 						sku_product_2 = lines[position_sku_product_1].get_product().barcode ;
	 						position_sku_product_2=position_sku_product_1;
	 					}
	 				}else if(sku_product_1 == -1 || sku_product_2 == -1) return false
	 				
	 				var price_with_tax_product_1 =  lines[position_sku_product_1].get_price_with_tax()/lines[position_sku_product_1].get_quantity();
	         	 	var price_with_tax_product_2 =  lines[position_sku_product_2].get_price_with_tax()/lines[position_sku_product_2].get_quantity();
	         	 	if (price_with_tax_product_1 < price_with_tax_product_2){
	         	 		new_line_lowest_price = position_sku_product_1
	         	 	}else{
	         	 		new_line_lowest_price = position_sku_product_2
	         	 	}
	 				
	 				
	 				if(sku_product_1 && sku_product_2){
	 					 var id_sku_1 = lines[position_sku_product_1].get_product().id; 
	 		        	 var id_sku_2 = lines[position_sku_product_2].get_product().id;
	 		        	 
	 					 if ((id_sku_1 == this.pos.disc[disc_line].product_2nd_disc_1[0] && id_sku_2 == this.pos.disc[disc_line].product_2nd_disc_2[0])||(id_sku_2 == this.pos.disc[disc_line].product_2nd_disc_1[0] && id_sku_1 == this.pos.disc[disc_line].product_2nd_disc_2[0])){
					 		var discount_real = this.pos.disc[disc_line].percent_discount
					 		var disc_real= Math.min(Math.max(parseFloat(discount_real) || 0, 0),100);
 		       
					 		lines[new_line_lowest_price].percent_discount_product =  disc_real
		            		
		            		order.orderlines.at(new_line_lowest_price).discountStr = "product get "+discount_real;
		            		order.orderlines.at(new_line_lowest_price).trigger('change',order.orderlines.at(new_line_lowest_price));
		            		order.orderlines.at(new_line_lowest_price).is_2nd_discount = true;
		            		return true;
		            	 }
	 				 }else{
	 					 return false	        	 
	 		         }

	 			}
	 		return false;
     },
     
     //(Second Discount)
     sort_orderline: function (){
    	 var unit_price = 1
    	 var id =0
    	 var id_order_lines = []
    	 var lines = this.get_orderlines();	
    	 var new_lines = new Array(lines.length)
    	 for ( var i = 0 ; i < lines.length ; i++){
    		 new_lines[i] = new Array(2)
    		 new_lines[i]["id_product"] = lines[i].get_product().id
    		 new_lines[i]["unit_price"] = lines[i].get_product().price + lines[i].get_tax();
    		 new_lines[i]["line"] = i
    	 }
    	 new_lines.sort(function(a, b) {
    		    return parseFloat(a.unit_price) - parseFloat(b.unit_price);
    		});

    	 return new_lines
     },
	    
	 add_product: function(product, options){
	 	this.reset_discount_bundling()
		_super_posorder.add_product.apply(this, arguments);
		var order = this.pos.get_order();
		var value = this.list_disc(product);
		var product_price = order.orderlines._byId[1].product.price;
		
		if(value !=0 ){
			order.get_selected_orderline().set_discount(value);//Set Discount -> Selected Orderline
		}
		// if(product_price >= this.value_ep){
		// 	var locatIdconf = this.pos.config.stock_location_id[0]
  //  			var otes = [];
  //           var xtes = [];
  //           var stes = [];
  //           var qtes = [];
  //           var celement = [];
  //           var qty_stock = [];
  //           var id_stock = [];
  //           var location_stock = [];
  //           var id_of_stock = [];
  //           var loc_wh = [];
  //           var qty_gift = [];
  //           var sqloc = [];
  //           var slocat = [];
  //           var dlocat = [];
  //           var locatid = [];
  //           var diffloc = [];
  //           var dif_stock = [];
  //           var dis_stock = [];
  //           var intern_loc = [];
  //           var difec = [];
  //           var not_available = [];
            
  //           for (var x=0; x < this.pos.gift_ids.length; x++){
  //               xtes.push(this.pos.gift_ids[x]) 
  //               stes.push(this.pos.gift_ids[x].id)    
  //               qtes.push(this.pos.gift_ids[x].qty_available) 
                
  //           }
  //           // looping stock quant
  //           for (var wh=0; wh<this.pos.location.length; wh++){
  //           	loc_wh.push(this.pos.location[wh]);
  //           	id_of_stock.push(this.pos.location[wh].product_id[0])
  //           	sqloc.push(this.pos.location[wh].location_id[0])	
  //           }
  //           // looping stock location
  //           for(var sl=0; sl<this.pos.locat.length; sl++){
  //           	dlocat.push(this.pos.locat[sl])
  //           	slocat.push(this.pos.locat[sl].id)
  //           	locatid.push(this.pos.locat[sl].location_id[0])	
  //           }
  //           for (var g=0; g < this.orderlines.length; g++){
  //               otes.push(this.orderlines.models[g].product.id)
  //               var id_orderline = this.orderlines.models[g].product.id;
  //           }
  //           // search the gift in orderline
  //           for (var r=0; r < otes.length; r++){
  //               for (var q=0; q < stes.length; q++){
  //                   if (otes[r] == stes[q]){
  //                       celement.push(otes[r])   
  //                   }
  //               }
  //           }
  //           // show popup freegift product
  //           if (celement.length > 0){
  //               return;
  //           }else{
  //               this.pos.gui.show_popup('free_gift_popup',{
  //                   'title': _t('Free Gift Discount'),
  //                   'list': xtes,
  //                   'current_order': this.pos.get_order(),               
  //               });
  //           }
  //           var bggift = [];
  //           for (var ch=0; ch<loc_wh.length; ch++){
  //              for (var lh=0; lh<slocat.length; lh++){
  //                   for (var sh=0; sh<stes.length; sh++){                 
  //                       if (loc_wh[ch].product_id[0] == stes[sh]){
  //                           if (locatIdconf == loc_wh[ch].location_id[0]){
  //                               id_stock.push(loc_wh[ch])
  //                           }
  //                           else if (locatIdconf != loc_wh[ch].location_id[0]){
  //                           	dif_stock.push(loc_wh[ch])
  //                           	// console.log('dif stock', dif_stock)
  //                           }
  //                       }
  //                   }
  //                   break;
  //               }
  //           }
  //           for (var fd=0; fd<dlocat.length; fd++){
  //           	for (var df=0; df<dif_stock.length; df++){
  //           	// console.log('df length', dif_stock.length)
            	
  //           		// console.log('d locat', dlocat[fd].id)
  //           		if (dif_stock[df].location_id[0] == dlocat[fd].id){
  //           			diffloc.push(dif_stock[df])
  //           			dis_stock.push(dlocat[fd])
  //           			// if (dis_stock)



  //           			console.log('hasil dif 1', diffloc)
  //           			console.log('hasil dis', dis_stock)
  //           		}

  //           	}
  //           }
  //           for(var rr=0; rr<dis_stock.length; rr++){
		// 		console.log('panjang', dis_stock)

		// 		if(dis_stock[rr].usage === 'internal'){
		// 			intern_loc.push(dis_stock[rr])
		// 			console.log('intern', intern_loc)
		// 		}
		// 	}
		// 	for(var ss=0; ss<dif_stock.length; ss++){
		// 		for(var zz=0; zz<intern_loc.length; zz++){
		// 			if(intern_loc[zz].id == dif_stock[ss].location_id[0]){
		// 				difec.push(dif_stock[ss])
		// 				console.log('difec', difec)
		// 			}
		// 		}
		// 	}
		// 	for(var cc=0; cc<xtes.length; cc++){
		// 		for(var tt=0; tt<difec.length; tt++){
		// 			if (difec[tt].product_id[0] == xtes[cc].id){
		// 				not_available.push(xtes[cc])
		// 				console.log('not available', not_available)
		// 			}
		// 		}
		// 	}
  //           for (var w=0; w<xtes.length; w++){
  //               // console.log('cek xtes', xtes[w])
  //               for (var r=0; r<id_stock.length; r++){
  //                   if(xtes[w].id == id_stock[r].product_id[0]){
  //                       bggift.push(xtes[w])
  //                   }  
  //               } 
  //           }
  //           for(var z=0;z<bggift.length;z++){
  //               if (bggift[z].qty_available <= 0){
  //                   $('div[data-item-id='+bggift[z].id+']').each(function(){
  //                       $(this).attr("style", "background-color:#DC143C;color:white")   
  //                   })
  //               }else{
  //                   $('div[data-item-id='+bggift[z].id+']').each(function(){
  //                       $(this).attr("style", "background-color:#98FB98;")
  //                   })
  //               }
  //           }
  //           for(var rc=0;rc<not_available.length;rc++){
  //           	$('div[data-item-id='+not_available[rc].id+']').each(function(){
  //                   $(this).attr("style", "background-color:#DC143C;color:white")
  //               })
  //           }
		// }
	 },
	 
	 // contains 1 to All in list Array
     containsOneinAll: function(values, list){
        if($.inArray(values, list) != -1) return true;
        return false;
     },
     
     reset_discount_bundling:function(){
    	 var lines = this.get_orderlines();
    	 if(lines.length==0){
    		 this.is_discount_bundling=false;
    		 this.discount_bundling_price=0;
    	 }
     },
     
     //function list discount promotion	
	 list_disc: function(product){
		var self = this; 
		var order = this.pos.get_order();
		var date_today = new Date();
		var date_parse = Date.parse(date_today);
		var discount_elizabeth = 0;
		var discount_real_sale = 0;
    	var discount_real_sesion = 0;
        //get store name and address store
        var branchIdconf = this.pos.config.branch_id[0]
        if(branchIdconf){
            for(var i=0;i<this.pos.models.length;i++){
            	var model = this.pos.models[i]
                if(model.model === 'res.partner'){
                    for(var j=0; j<model.domain[0][0].length;j++){
                        if(model.domain[0][0] === 'is_branch'){
                            for(var k=0;k<this.pos.partners.length;k++){
                                var discount_line = this.pos.disc
                                var partners = this.pos.partners[k]
                                var partner = partners
                                var discpromo = partner.discpromo_id[0]
                                var barcode = product.barcode
                                for(var z=0; z<this.pos.discount.length;z++){
                                	if(this.pos.partners[k].discpromo_id[0] == this.pos.discount[z].id){
	                        			var cons_exc_prod_sale = "";
	                        			var cons_spec_branch_sale = "";
	                    				var sku_pref_prod_sale = "";
	                        			var cons_exc_prod_sesion = "";
	                    				var cons_spec_branch_sesion = "";
	                    				var sku_pref_prod_sesion = "";
	                    				var invent = "";
	                        			var all_branch = "";
	                        			var type_sale = "";
	                        			var type_season = "";
	                        			var array_type_sale = [];
	                        			var array_type_season = [];
	                                	var id_line = this.pos.discount[z].disc_promotion_line;
	                                	for(var l=0; l<this.pos.disc.length;l++){
	                                		var startdate_parse = Date.parse(new Date(Date.parse(this.pos.disc[l].date_start+ "+0000")));
	                                		var enddate_parse = Date.parse(new Date(Date.parse(this.pos.disc[l].date_end+ "+0000")));
	                                		//condition to check active or not the Discount Promotion from each branch
	                                		if(this.pos.discount[z].active == true && this.pos.discount[z].id == discpromo && this.pos.disc[l].disc_promotion_id[0] == this.pos.discount[z].id && branchIdconf == partners.id){
		                                    	var cons = this.containsOneinAll(branchIdconf,this.pos.disc[l].spec_branch);
		                                    	var sku_id = this.pos.disc[l].sku_id;
		                                    	var member = this.containsOneinAll((product.id),sku_id);
		                                    	var sku_pref = (product.barcode).substring(0,4);
		                                    	var cust_type = this.pos.disc[l].customer_type;
	                                    		var cust_disc_type = this.pos.disc[l].customer_disc_type;
	                                    		if(id_line = this.pos.disc[l].id){
	                                    			if(this.pos.disc[l].state === 'validate'){
		                                    			if(cust_disc_type === 'sale'){//Disc Sale
		                                    				if(date_parse>=startdate_parse && date_parse <= enddate_parse){
		                                    					for(var y=0;y< this.pos.inventory.length;y++){
		                                    						if (this.pos.disc[l].id == this.pos.inventory[y].discount_promotion_line_id[0]){
		                                    							if (this.pos.disc[l].customer_disc_type == 'sale' && this.pos.disc[l].state == 'validate'){
		    			                                    				cons_exc_prod_sale = this.containsOneinAll(product.id, this.pos.inventory[y].exception_sku);
		    			                                    				cons_spec_branch_sale = this.containsOneinAll(branchIdconf, this.pos.inventory[y].spec_branch);
		    			                                    				sku_pref_prod_sale = this.pos.inventory[y].four_digit_prefix_sku;
		    			                                    				invent = this.pos.inventory[y].inventory_type_ids;
		    			                                    				all_branch = this.pos.inventory[y].all_branch;
		    				                                    			if (cons_spec_branch_sale){
		    				                                    				if (cons_exc_prod_sale){
		    				                                    					discount_real_sale = this.pos.inventory[y].discount;
		    				                                    					type_sale = "exception_sku";
		    				                                    					array_type_sale.push(type_sale);
		    				                                    				}if(sku_pref_prod_sale){
		    				                                    					if(sku_pref_prod_sale === barcode.substring(0, 4)){
		    					                                    					discount_real_sale = this.pos.inventory[y].discount;
		    					                                    					type_sale = "prefix";
		    					                                    					array_type_sale.push(type_sale);
		    				                                    					}
		    				                                    				}if(invent){
		    				                                    					var inventor = [];
		    				                                    					for(var g = 0; g < invent.length;g++){
		    		    		                        	                			inventor.push(invent);
		    		    		                        	                			if(product.inventory_type_id[0] === inventor[g][0]){
		    		    		                        	                				discount_real_sale = this.pos.inventory[y].discount;
		    		    		                        	                				type_sale = "invent_ids";
		    		    		                        	                				array_type_sale.push(type_sale);
		    		        		                        	                		}else{
		    		        		                        	                			break;
		    		        		                        	                		}
		    		    		                        	                		}
		    				                                    				}if(this.pos.inventory[y].origin){
		    				                                    					if(product.origin === this.pos.inventory[y].origin){
		    				                                    						discount_real_sale = this.pos.inventory[y].discount;
		    				                                    						type_sale = "origin";
		    				                                    						array_type_sale.push(type_sale);
		    				                                    					}
		    				                                    				}if(this.pos.inventory[y].brand_id){
		    				                                    					var brand = [];
		    				                                    					for(var b = 0; b < this.pos.inventory[y].brand_id.length;b++){
		    		    		                        	                			brand.push(this.pos.inventory[y].brand_id);
		    		    		                        	                			if(product.brand_id[0] === brand[b][0]){
		    		    		                        	                				discount_real_sale = this.pos.inventory[y].discount;
		    		    		                        	                				type_sale = "brand";
		    		    		                        	                				array_type_sale.push(type_sale);
		    		        		                        	                		}else{
		    		        		                        	                			break; 
		    		        		                        	                		}
		    		    		                        	                		}
		    				                                    				}if(this.pos.inventory[y].supplier_id){
		    				                                    					var supplier = [];
		    				                                    					for(var s = 0; s < this.pos.inventory[y].supplier_id.length;s++){
		    				                                    						supplier.push(this.pos.inventory[y].supplier_id);
		    		    		                        	                			if(product.supplier_id[0] === supplier[s][0]){
		    		    		                        	                				discount_real_sale = this.pos.inventory[y].discount;
		    		    		                        	                				type_sale = "supplier";
		    		    		                        	                				array_type_sale.push(type_sale);
		    		        		                        	                		}else{
		    		        		                        	                			break; 
		    		        		                        	                		}
		    		    		                        	                		}
		    				                                    				}if(this.pos.inventory[y].all_inventory){
		    				                                    					discount_real_sale = this.pos.inventory[y].discount;
		    				                                    					type_sale = "all_invent";
		    				                                    					array_type_sale.push(type_sale);
		    				                                    				}
		    		                                    					}if(all_branch){
		    		                                    						if (cons_exc_prod_sale){
		    				                                    					discount_real_sale = this.pos.inventory[y].discount;
		    				                                    					type_sale = "exception_sku";
		    				                                    					array_type_sale.push(type_sale);
		    				                                    				}if(sku_pref_prod_sale){
		    				                                    					if(sku_pref_prod_sale === barcode.substring(0, 4)){
		    					                                    					discount_real_sale = this.pos.inventory[y].discount;
		    					                                    					type_sale = "prefix";
		    					                                    					array_type_sale.push(type_sale);
		    				                                    					}
		    				                                    				}if(invent){
		    				                                    					var inventor = [];
		    				                                    					for(var g = 0; g < invent.length;g++){
		    		    		                        	                			inventor.push(invent);
		    		    		                        	                			if(product.inventory_type_id[0] === inventor[g][0]){
		    		    		                        	                				discount_real_sale = this.pos.inventory[y].discount;
		    		    		                        	                				type_sale = "invent_ids";
		    		    		                        	                				array_type_sale.push(type_sale);
		    		        		                        	                		}else{
		    		        		                        	                			break;
		    		        		                        	                		}
		    		    		                        	                		}
		    				                                    				}if(this.pos.inventory[y].origin){
		    				                                    					if(product.origin === this.pos.inventory[y].origin){
		    				                                    						discount_real_sale = this.pos.inventory[y].discount;
		    				                                    						type_sale = "origin";
		    				                                    						array_type_sale.push(type_sale);
		    				                                    					}
		    				                                    				}if(this.pos.inventory[y].brand_id){
		    				                                    					var brand = [];
		    				                                    					for(var b = 0; b < this.pos.inventory[y].brand_id.length;b++){
		    		    		                        	                			brand.push(this.pos.inventory[y].brand_id);
		    		    		                        	                			if(product.brand_id[0] === brand[b][0]){
		    		    		                        	                				discount_real_sale = this.pos.inventory[y].discount;
		    		    		                        	                				type_sale = "brand";
		    		    		                        	                				array_type_sale.push(type_sale);
		    		        		                        	                		}else{
		    		        		                        	                			break; 
		    		        		                        	                		}
		    		    		                        	                		}
		    				                                    				}if(this.pos.inventory[y].supplier_id){
		    				                                    					var supplier = [];
		    				                                    					for(var s = 0; s < this.pos.inventory[y].supplier_id.length;s++){
		    				                                    						supplier.push(this.pos.inventory[y].supplier_id);
		    		    		                        	                			if(product.supplier_id[0] === supplier[s][0]){
		    		    		                        	                				discount_real_sale = this.pos.inventory[y].discount;
		    		    		                        	                				type_sale = "supplier";
		    		    		                        	                				array_type_sale.push(type_sale);
		    		        		                        	                		}else{
		    		        		                        	                			break;
		    		        		                        	                		}
		    		    		                        	                		}
		    				                                    				}if(this.pos.inventory[y].all_inventory){
		    				                                    					discount_real_sale = this.pos.inventory[y].discount;
		    				                                    					type_sale = "all_invent";
		    				                                    					array_type_sale.push(type_sale);
		    				                                    				}
		    			                                    				}
		    	                                    					}
		                                    						}
		                                    					}
		                                    				}
		                                    			}else if(cust_disc_type === 'season'){//Disc Sesion
		                                    				if(date_parse>=startdate_parse && date_parse <= enddate_parse){
		                                    					for(var y=0;y< this.pos.inventory.length;y++){
		                                    						if (this.pos.disc[l].id == this.pos.inventory[y].discount_promotion_line_id[0]){
		                                    							if (this.pos.disc[l].customer_disc_type == 'season' && this.pos.disc[l].state == 'validate'){
						                                    				cons_exc_prod_sesion = this.containsOneinAll(product.id,this.pos.inventory[y].exception_sku);
						                                    				cons_spec_branch_sesion = this.containsOneinAll(branchIdconf, this.pos.inventory[y].spec_branch);
						                                    				sku_pref_prod_sesion = this.pos.inventory[y].four_digit_prefix_sku;
						                                    				invent = this.pos.inventory[y].inventory_type_ids;
						                                    				all_branch = this.pos.inventory[y].all_branch;
							                                    			if (cons_spec_branch_sesion){
							                                    				if (cons_exc_prod_sesion){
							                                    					discount_real_sesion = this.pos.inventory[y].discount;
							                                    					type_season = "exception_sku";
							                                    					array_type_season.push(type_season);
							                                    				}if(sku_pref_prod_sesion){
							                                    					if(sku_pref_prod_sesion === barcode.substring(0, 4)){
								                                    					discount_real_sesion = this.pos.inventory[y].discount;
								                                    					type_season = "prefix";
								                                    					array_type_season.push(type_season);
							                                    					}
							                                    				}if(invent){
							                                    					var inventor = [];
							                                    					for(var g = 0; g < invent.length;g++){
					    		                        	                			inventor.push(invent);
					    		                        	                			if(product.inventory_type_id[0] === inventor[g][0]){
					    		                        	                				discount_real_sesion = this.pos.inventory[y].discount;
					    		                        	                				type_season = "invent_ids";
					    		                        	                				array_type_season.push(type_season);
					        		                        	                		}
					    		                        	                			break; 
					    		                        	                		}
							                                    				}if(this.pos.inventory[y].origin){
							                                    					if(product.origin === this.pos.inventory[y].origin){
							                                    						discount_real_sesion = this.pos.inventory[y].discount;
							                                    						type_season = "origin";
							                                    						array_type_season.push(type_season);
							                                    					}
							                                    				}if(this.pos.inventory[y].brand_id){
							                                    					var brand = [];
							                                    					for(var b = 0; b < this.pos.inventory[y].brand_id.length;b++){
					    		                        	                			brand.push(this.pos.inventory[y].brand_id);
					    		                        	                			if(product.brand_id[0] === brand[b][0]){
					    		                        	                				discount_real_sesion = this.pos.inventory[y].discount;
					    		                        	                				type_season = "brand";
					    		                        	                				array_type_season.push(type_season);
					        		                        	                		}
					    		                        	                			break; 
					    		                        	                		}
							                                    				}if(this.pos.inventory[y].supplier_id){
							                                    					var supplier = [];
							                                    					for(var s = 0; s < this.pos.inventory[y].supplier_id.length;s++){
							                                    						supplier.push(this.pos.inventory[y].supplier_id);
					    		                        	                			if(product.supplier_id[0] === supplier[s][0]){
					    		                        	                				discount_real_sesion = this.pos.inventory[y].discount;
					    		                        	                				type_season = "supplier";
					    		                        	                				array_type_season.push(type_season);
					        		                        	                		}
					    		                        	                			break; 
					    		                        	                		}
							                                    				}if(this.pos.inventory[y].all_inventory){
							                                    					discount_real_sesion = this.pos.inventory[y].discount;
							                                    					type_season = "all_invent";
							                                    					array_type_season.push(type_season);
							                                    				}
							                                    			}if(all_branch){
							                                    				if (cons_exc_prod_sesion){
							                                    					discount_real_sesion = this.pos.inventory[y].discount;
							                                    					type_season = "exception_sku";
							                                    					array_type_season.push(type_season);
							                                    				}if(sku_pref_prod_sesion){
							                                    					if(sku_pref_prod_sesion === barcode.substring(0, 4)){
								                                    					discount_real_sesion = this.pos.inventory[y].discount;
								                                    					type_season = "prefix";
								                                    					array_type_season.push(type_season);
							                                    					}
							                                    				}if(invent){
							                                    					var inventor = [];
							                                    					for(var g = 0; g < invent.length;g++){
					    		                        	                			inventor.push(invent);
					    		                        	                			if(product.inventory_type_id[0] === inventor[g][0]){
					    		                        	                				discount_real_sesion = this.pos.inventory[y].discount;
					    		                        	                				type_season = "invent_ids";
					    		                        	                				array_type_season.push(type_season);
					        		                        	                		}
					    		                        	                			break; 
					    		                        	                		}
							                                    				}if(this.pos.inventory[y].origin){
							                                    					if(product.origin === this.pos.inventory[y].origin){
							                                    						discount_real_sesion = this.pos.inventory[y].discount;
							                                    						type_season = "origin";
							                                    						array_type_season.push(type_season);
							                                    					}
							                                    				}if(this.pos.inventory[y].brand_id){
							                                    					var brand = [];
							                                    					for(var b = 0; b < this.pos.inventory[y].brand_id.length;b++){
					    		                        	                			brand.push(this.pos.inventory[y].brand_id);
					    		                        	                			if(product.brand_id[0] === brand[b][0]){
					    		                        	                				discount_real_sesion = this.pos.inventory[y].discount;
					    		                        	                				type_season = "brand";
					    		                        	                				array_type_season.push(type_season);
					        		                        	                		}
					    		                        	                			break; 
					    		                        	                		}
							                                    				}if(this.pos.inventory[y].supplier_id){
							                                    					var supplier = [];
							                                    					for(var s = 0; s < this.pos.inventory[y].supplier_id.length;s++){
							                                    						supplier.push(this.pos.inventory[y].supplier_id);
					    		                        	                			if(product.supplier_id[0] === supplier[s][0]){
					    		                        	                				discount_real_sesion = this.pos.inventory[y].discount;
					    		                        	                				type_season = "supplier";
					    		                        	                				array_type_season.push(type_season);
					        		                        	                		}
					    		                        	                			break; 
					    		                        	                		}
							                                    				}if(this.pos.inventory[y].all_inventory){
							                                    					discount_real_sesion = this.pos.inventory[y].discount;
							                                    					type_season = "all_invent";
							                                    					array_type_season.push(type_season);
							                                    				}
						                                    				}
				                                    					}
		                                    						}
		                                    					}
		                                    				}
		                                    			}
	                                    			}//end validate state
	                                    			if(cust_disc_type == '2disc' && discount_elizabeth ==0){//Disc 2nd
	                                    				if(this.pos.disc[l].all_branch){
	                                        				if(date_parse>=startdate_parse && date_parse <= enddate_parse ){
	                                        					var disc_line = l
	                                        					var is_2nd_disc = this.set_2nd_disc_merge(disc_line)
	                                        					if (is_2nd_disc ){
	                                        						return 0
	                                        					}
	                                        				}
	                                        			}else if(cons){
	                                        				if(date_parse>=startdate_parse && date_parse <= enddate_parse ){
	                                        					var specific_branch = this.pos.disc[l].spec_branch;
	                                        					for(var k = 0 ; k < specific_branch.length ; k++ ){
	                                        						if (branchIdconf == specific_branch[k] ){
	                                        							var disc_line = l
	                                                					var is_2nd_disc = this.set_2nd_disc_merge(disc_line)
	                                                					if (is_2nd_disc){
	                                                						return 0
	                                                					}
	                                        						}
	                                        					}
	                                        				}
	                                        			}
	                                    			}else if(cust_disc_type === 'bundling'){//Disc Bundling
	                                    				if(this.pos.disc[l].all_branch){
	                                        				if(date_parse>=startdate_parse && date_parse <= enddate_parse ){
	                                        					var sku_id_products = this.pos.disc[l].sku_id;
	                                        					var disc_line = l
	                                        					var is_discoiunt_bundling = this.set_discount_bundling(disc_line)
	                                        					if(is_discoiunt_bundling){
	                                        						
	                                        						return 0
	                                        					}
	                                        				}
	                                        			}else if(cons){
	                                        				if(date_parse>=startdate_parse && date_parse <= enddate_parse ){
	                                        					var disc_line = l
	                                        					var is_discoiunt_bundling = this.set_discount_bundling(disc_line)
	                                        					if(is_discoiunt_bundling){
	                                        						
	                                        						return 0
	                                        					}
	                                        				}
	                                        			}
	                                    			}else if(cust_disc_type == 'freegift'){
	                                    				if(this.pos.disc[l].all_branch){
                                        					if(date_parse >= Date.parse(this.pos.disc[l].date_start) && date_parse <= Date.parse(this.pos.disc[l].date_end) ){ 						
                                            					if(this.pos.disc[l].every_purchase){
				                        	                		this.value_ep = this.pos.disc[l].every_purchase
				                        	                	}
				                        	                	if(this.pos.disc[l].gift){
				                        	                		this.gift_ep = this.pos.disc[l].gift
				                        	                	}				                                                
                                        					}
                                        				}else{
                                        					if(date_parse >= Date.parse(this.pos.disc[l].date_start) && date_parse <= Date.parse(this.pos.disc[l].date_end) ){
	                                            						                                            					
                                            					var bo = [];
                                            			
                                            					if(this.pos.disc[l].spec_branch){
				                        	                		this.spec_of_branch = this.pos.disc[l].spec_branch
				                        	                		
				                        	                	}	
                                            					for (var bt=0; bt<this.spec_of_branch.length; bt++){
                                            							if (this.spec_of_branch[bt] == partner.id){
                                            								bo.push(this.spec_of_branch[bt])	
                                            							}
                                            					}
                                            					if (bo.length > 0){
                                            						if(this.pos.disc[l].every_purchase){
					                        	                		this.value_ep = this.pos.disc[l].every_purchase
					                        	                	}
					                        	                	if(this.pos.disc[l].gift){
					                        	                		this.gift_ep = this.pos.disc[l].gift
					                        	                	}
                                            					}else{
                                            						return;
                                            					}
                                        					}
                                        				}
	                                    			}
	                                    		}
	                                		}
	                                	}
	                                	if(type_sale != "" && type_season != "" && type_sale == type_season){
		                                	if(discount_real_sesion >= discount_real_sale){
		                                		discount_elizabeth = discount_real_sesion;
		                                	}else{
		                                		discount_elizabeth = discount_real_sale;
		                                	}
	                                	}if(type_sale != type_season){
	                                		if(type_sale != "" && !(array_type_season.includes(type_sale))){
	                                			discount_elizabeth = discount_real_sale;
	                                		}if(type_season != "" && !(array_type_sale.includes(type_season))){
	                                			discount_elizabeth = discount_real_sesion;
	                                		}
	                                	}
	                                }
                            	}
                            }
                        }
                    }
                }
            }
        }else{
            partner = false;
        }
        return discount_elizabeth;
	 },
	 
    get_percent_discount_bundling : function(){
		var order = this.pos.get_order();
		return this.discount_bundling_percent
	},
	
	get_price_discount_bundling : function(){
		 return this.discount_bundling_price
	},
	 
	get_name_discount_bundling : function(){
		 return this.product_get_name__discount_bundling 
	},
	
	get_use_price_discount : function (){
		 return this.use_price_discount
	},
	
	never_check : function(id_product_checked ,product_id){
		for (var i = 0 ; i <  id_product_checked.length ; i++){
			if (product_id == id_product_checked[i])
				return false
		}		
		return true
	},
	array_is_same : function(array1,array2){
		array1 = array1.sort()
		array2=array2.sort()
		for ( var i = 0 ; i < array1.length;i++){
			if(array1[i]!=array2[i])
				return false
		}
		return true
	},
	
	//function discoun bundling
	set_discount_bundling : function(disc_line){
        var order = this.pos.get_order();
        var orderline = order.get_orderlines();
        var sku_id_products = this.pos.disc[disc_line].sku_id;
        this.product_list = [];
        var id_product_orderline=[];
        var id_product_checked = []
        var k = 0;
        var product_same = 0
        var price_product_same = 0
        order.product_get_name__discount_bundling = ''
        for(var n=0; n<orderline.length; n++){
            this.product_list.push(this.pos.db.get_product_by_id(orderline[n].product.id))
            var temp=this.product_list[n];
            id_product_orderline.push(temp.id);
	        for (var v = 0; v<sku_id_products.length; v++) {
	        	
	            if (orderline[n].get_product().id == sku_id_products[v] &&this.never_check(id_product_checked,orderline[n].get_product().id  ) ) {
	            	id_product_checked[k++] = sku_id_products[v]
	            	product_same +=1 
	            	price_product_same += orderline[n].get_price_with_tax()/orderline[n].get_quantity()
	            	order.product_get_name__discount_bundling += orderline[n].get_product().name + ', '
	            }
	        }
        }
        if (product_same == sku_id_products.length && this.array_is_same(id_product_checked,sku_id_products)){
	    	order.is_discount_bundling  = true
	    	this.use_price_discount = this.pos.disc[disc_line].use_price_discount
	    	if (this.pos.disc[disc_line].use_price_discount){//use price discount
	    		order.discount_bundling_price = this.pos.disc[disc_line].price_discount
	    	}
	    	else {//use percent discount
	    		order.discount_bundling_percent = this.pos.disc[disc_line].percent_discount	            			
	    		order.discount_bundling_price = price_product_same * order.discount_bundling_percent/100
	    	}
	    	this.disc_bundling_product = sku_id_products
    		self.document.querySelector('.value').textContent = this.format_currency_no_comma(this.get_total_with_tax());
    		self.document.querySelector('.value_discount_bundling').textContent = this.format_currency_no_comma(order.discount_bundling_price);
	    	this.add_orderline(orderline[orderline.length-1]); // to refresh discount bundling view (Stupid Thungs!!!!!)
	    	return true
	    }
        return false
	},
	
   	//function list discount bank
   	list_disc_bank: function(){
		var self = this;
		var order = this.pos.get_order();
		var date_today = new Date();
		var date_parse = Date.parse(date_today);
		 
		var list_bank_discount = [];
		var id_list_discount_active = [];
		var counter = 0;
		var branchIdconf = this.pos.config.branch_id[0];
		var counter_bank = 0;
		var check_config_discount=false;
		 
		for(var x=0;x<this.pos.partners.length;x++){
			if(branchIdconf == this.pos.partners[x].id){
				if(this.pos.partners[x].discpromo_id != false)
					check_config_discount=true;
				}
		}
		
		if(check_config_discount){
		//get active discount line
		for(var counter_1=0;counter_1<this.pos.discount.length;counter_1++){
			for (var counter_2=0;counter_2<this.pos.discount[counter_1].disc_promotion_line.length;counter_2++){
				id_list_discount_active[counter] = this.pos.discount[counter_1].disc_promotion_line[counter_2];
					counter++;
			}
		}
		counter = 0;
		//get all information discount line type bank , specific branch or all branch from active discount
		while (counter < id_list_discount_active.length){
			 for (var counter_3=0;counter_3<this.pos.disc.length;counter_3++){
				 if (id_list_discount_active[counter] == this.pos.disc[counter_3].id){
					 if(this.pos.disc[counter_3].customer_disc_type == 'bank' && date_parse >= Date.parse(this.pos.disc[counter_3].date_start) && date_parse <= Date.parse(this.pos.disc[counter_3].date_end)){
							var value_boolean = this.containsOneinAll(branchIdconf,this.pos.disc[counter_3].spec_branch);
							 if(this.pos.disc[counter_3].all_branch){
								list_bank_discount[counter_bank] = this.pos.disc[counter_3];
								counter_bank++;
							}
							else if(value_boolean){
								list_bank_discount[counter_bank] = this.pos.disc[counter_3];
								counter_bank++;
							}
							 
						 }
					 }
				 }
			 counter++;
			 }
			 return list_bank_discount;
		}else{
			 return list_bank_discount;
		}
   	},
	
	format_currency_no_comma: function(amount) {
        var currency = (this.pos && this.pos.currency) ? this.pos.currency : {symbol:'$', position: 'after', rounding: 0.01, decimals: 2};
        var decimals = 0;


        if (typeof amount === 'number') {
            amount = round_di(amount,decimals).toFixed(decimals);
            amount = formats.format_value(round_di(amount, decimals), { type: 'float', digits: [69, decimals]});
        }
        if (currency.position === 'after') {
            return amount + ' ' + (currency.symbol || '');
        } else {
            return (currency.symbol || '') + ' ' + amount;
        }        
    },

    get_total_with_tax: function() {
   		var total_alt = this.get_total_without_tax() + this.get_total_tax();

   		
   		if (total_alt >= this.value_ep){

   			console.log('gift:', this.gift_ep)

   			var locatIdconf = this.pos.config.stock_location_id[0]
   			var otes = [];
            var xtes = [];
            var stes = [];
            var qtes = [];
            var celement = [];
            var qty_stock = [];
            var id_stock = [];
            var location_stock = [];
            var id_of_stock = [];
            var loc_wh = [];
            var qty_gift = [];
            var sqloc = [];
            var slocat = [];
            var dlocat = [];
            var locatid = [];
            var diffloc = [];
            var dif_stock = [];
            var dis_stock = [];
            var intern_loc = [];
            var difec = [];
            var not_available = [];
            
            for (var x=0; x < this.pos.gift_ids.length; x++){
                xtes.push(this.pos.gift_ids[x]) 
                stes.push(this.pos.gift_ids[x].id)    
                qtes.push(this.pos.gift_ids[x].qty_available) 
                
            }
            // looping stock quant
            for (var wh=0; wh<this.pos.location.length; wh++){
            	loc_wh.push(this.pos.location[wh]);
            	id_of_stock.push(this.pos.location[wh].product_id[0])
            	sqloc.push(this.pos.location[wh].location_id[0])	
            }
            // looping stock location
            for(var sl=0; sl<this.pos.locat.length; sl++){
            	dlocat.push(this.pos.locat[sl])
            	slocat.push(this.pos.locat[sl].id)
            	locatid.push(this.pos.locat[sl].location_id[0])	
            }
            for (var g=0; g < this.orderlines.length; g++){
                otes.push(this.orderlines.models[g].product.id)
                var id_orderline = this.orderlines.models[g].product.id;
            }
            // search the gift in orderline
            for (var r=0; r < otes.length; r++){
                for (var q=0; q < stes.length; q++){
                    if (otes[r] == stes[q]){
                        celement.push(otes[r])   
                    }
                }
            }
            // show popup freegift product
            if (celement.length > 0){
                return;
            }else{
                this.pos.gui.show_popup('free_gift_popup',{
                    'title': _t('Free Gift Discount'),
                    'list': xtes,
                    'current_order': this.pos.get_order(),               
                });
            }
            var bggift = [];
            for (var ch=0; ch<loc_wh.length; ch++){
               for (var lh=0; lh<slocat.length; lh++){
                    for (var sh=0; sh<stes.length; sh++){                 
                        if (loc_wh[ch].product_id[0] == stes[sh]){
                            if (locatIdconf == loc_wh[ch].location_id[0]){
                                id_stock.push(loc_wh[ch])
                            }
                            else if (locatIdconf != loc_wh[ch].location_id[0]){
                            	dif_stock.push(loc_wh[ch])
                            	// console.log('dif stock', dif_stock)
                            }
                        }
                    }
                    break;
                }
            }
            for (var fd=0; fd<dlocat.length; fd++){
            	for (var df=0; df<dif_stock.length; df++){
            	// console.log('df length', dif_stock.length)
            	
            		// console.log('d locat', dlocat[fd].id)
            		if (dif_stock[df].location_id[0] == dlocat[fd].id){
            			diffloc.push(dif_stock[df])
            			dis_stock.push(dlocat[fd])
            			// if (dis_stock)



            			// console.log('hasil dif 1', diffloc)
            			// console.log('hasil dis', dis_stock)
            		}

            	}
            }
            for(var rr=0; rr<dis_stock.length; rr++){
				// console.log('panjang', dis_stock)

				if(dis_stock[rr].usage === 'internal'){
					intern_loc.push(dis_stock[rr])
					// console.log('intern', intern_loc)
				}
			}
			for(var ss=0; ss<dif_stock.length; ss++){
				for(var zz=0; zz<intern_loc.length; zz++){
					if(intern_loc[zz].id == dif_stock[ss].location_id[0]){
						difec.push(dif_stock[ss])
						// console.log('difec', difec)
					}
				}
			}
			for(var cc=0; cc<xtes.length; cc++){
				for(var tt=0; tt<difec.length; tt++){
					if (difec[tt].product_id[0] == xtes[cc].id){
						not_available.push(xtes[cc])
						// console.log('not available', not_available)
					}
				}
			}
            for (var w=0; w<xtes.length; w++){
                // console.log('cek xtes', xtes[w])
                for (var r=0; r<id_stock.length; r++){
                    if(xtes[w].id == id_stock[r].product_id[0]){
                        bggift.push(xtes[w])
                    }  
                } 
            }
            for(var z=0;z<bggift.length;z++){
                if (bggift[z].qty_available <= 0){
                    $('div[data-item-id='+bggift[z].id+']').each(function(){
                        $(this).attr("style", "background-color:#DC143C;color:white")   
                    })
                }else{
                    $('div[data-item-id='+bggift[z].id+']').each(function(){
                        $(this).attr("style", "background-color:#98FB98;")
                    })
                }
            }
            for(var rc=0;rc<not_available.length;rc++){
            	$('div[data-item-id='+not_available[rc].id+']').each(function(){
                    $(this).attr("style", "background-color:#DC143C;color:white")
                })
            }

   		}

   		return this.get_total_without_tax() + this.get_total_tax();
   	},
 });
 
 // discount bundling delete orderline
 screens.NumpadWidget.include({
	 
	never_check : function(id_product_checked ,product_id){
			for (var i = 0 ; i <  id_product_checked.length ; i++){
				if (product_id == id_product_checked[i])
					return false
			}		
			return true
		},
	array_is_same : function(array1,array2){
			array1 = array1.sort()
			array2=array2.sort()
			for ( var i = 0 ; i < array1.length;i++){
				if(array1[i]!=array2[i])
					return false
			}
			return true
		},

	 clickDeleteLastChar: function() {    	
	    	var order = this.pos.get_order();
	    	var lines = this.pos.get_order().get_orderlines();
	    	var id_product_checked = []
	    	var k = 0

	    	if (order.is_discount_bundling){
	    		var same = 0;
	    		for(var i = 0 ; i < lines.length ; i++){
	    			for (var j =0 ; j <  order.disc_bundling_product.length ; j++  ){
	    				if(lines[i].get_product().id == order.disc_bundling_product[j] && lines[i].get_quantity()>0 && this.never_check(id_product_checked,lines[i].get_product().id   )){
	    					id_product_checked[k++] = order.disc_bundling_product[j]
	    					same+=1;	    					
	    					break
	    				}
	    			}
	    		}

	    		if (same == order.disc_bundling_product.length&& this.array_is_same(id_product_checked,order.disc_bundling_product)){
					return this.state.deleteLastChar();
				}
	    		else{//beda
	    			order.discount_bundling_price =0;
		    		order.is_discount_bundling=false	    		
		    		self.document.querySelector('.value_discount_bundling').textContent = 0;
		    		self.document.querySelector('.value_product_discount_bundling').textContent = '';		    		
	    		}
	    	}
	    	
	        return this.state.deleteLastChar();
	    },

 });
 
})